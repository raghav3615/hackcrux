// services/emailService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { google } = require('googleapis');
const fs = require('fs').promises;
const path = require('path');
const { sendEmail } = require('./email');
const { getGmailClient } = require('./auth/googleAuth');
require('dotenv').config();

// Cache implementation for API responses
const emailCache = new Map();
const styleCacheExpiry = 60 * 60 * 1000; // 1 hour cache for style analysis

// Connection pooling for Gmail client
let gmailClientInstance = null;
let lastGmailClientRefresh = 0;
const GMAIL_CLIENT_REFRESH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Initialize Gemini API
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

// Email state object
let emailState = {
  active: false,
  stage: 'init', // init, collecting_purpose, collecting_recipient, collecting_subject, collecting_body, confirming, editing, generating_body
  data: {
    to: '',
    subject: '',
    body: '',
    purpose: '',
    styleAnalysis: null
  }
};

/**
 * Search emails with pagination, batching and caching
 * @param {string} recipient - Email address of recipient
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Array>} Array of email objects
 */
async function searchEmails(recipient, maxResults = 10) {
  const cacheKey = `emails_${recipient}_${maxResults}`;
  
  // Check cache first
  if (emailCache.has(cacheKey)) {
    const cachedData = emailCache.get(cacheKey);
    if (Date.now() - cachedData.timestamp < 5 * 60 * 1000) { // 5 min cache
      console.log(`Using cached email data for ${recipient}`);
      return cachedData.emails;
    }
  }
  
  try {
    const gmail = await getGmailClient();
    
    if (!gmail) {
      console.error('Gmail client unavailable');
      return [];
    }
    
    console.log(`Searching emails for recipient: ${recipient}`);
    
    // Search for emails to the recipient with pagination
    let allMessages = [];
    let nextPageToken = null;
    let remainingResults = maxResults;
    
    do {
      const pageSize = Math.min(remainingResults, 100); // Max 100 per request
      
      const res = await gmail.users.messages.list({
        userId: 'me',
        q: `to:${recipient}`,
        maxResults: pageSize,
        pageToken: nextPageToken
      });
      
      const messages = res.data.messages || [];
      allMessages = allMessages.concat(messages);
      
      nextPageToken = res.data.nextPageToken;
      remainingResults -= messages.length;
      
    } while (nextPageToken && remainingResults > 0);
    
    if (allMessages.length === 0) {
      console.log('No messages found sent to', recipient);
      emailCache.set(cacheKey, { emails: [], timestamp: Date.now() });
      return [];
    }
    
    console.log(`Found ${allMessages.length} emails to ${recipient}`);
    
    // Batch request for email content - process in chunks of 5 to avoid overloading
    const emails = [];
    const batchSize = 5;
    
    for (let i = 0; i < Math.min(allMessages.length, maxResults); i += batchSize) {
      const batch = allMessages.slice(i, i + batchSize);
      
      // Process batch in parallel
      const batchResults = await Promise.allSettled(
        batch.map(message => 
          gmail.users.messages.get({
            userId: 'me',
            id: message.id
          })
        )
      );
      
      // Add successful results
      batchResults.forEach(result => {
        if (result.status === 'fulfilled') {
          emails.push(result.value.data);
        }
      });
    }
    
    // Cache the results
    emailCache.set(cacheKey, { emails, timestamp: Date.now() });
    
    // Print email subjects and snippets for debugging
    console.log('--- PREVIOUS EMAILS ---');
    emails.forEach((email, index) => {
      const subject = email.payload.headers.find(h => h.name === 'Subject')?.value || 'No Subject';
      console.log(`Email ${index+1}: ${subject}`);
      console.log(`Snippet: ${email.snippet}`);
      console.log('---');
    });
    
    return emails;
  } catch (error) {
    console.error('Error searching emails:', error);
    
    // Return cached data if available, even if expired
    if (emailCache.has(cacheKey)) {
      console.log('Returning expired cache data due to error');
      return emailCache.get(cacheKey).emails;
    }
    
    return [];
  }
}

/**
 * Extract email content from email object
 * @param {Object} email - Email object from Gmail API
 * @returns {string} Extracted email content
 */
function extractEmailContent(email) {
  try {
    // Extract body parts from payload
    const parts = email.payload.parts || [];
    const body = email.payload.body;
    
    let content = '';
    
    // Try to get content from body directly
    if (body && body.data) {
      const decodedBody = Buffer.from(body.data, 'base64').toString('utf-8');
      content += decodedBody;
    }
    
    // Or extract from parts
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body && part.body.data) {
        const decodedPart = Buffer.from(part.body.data, 'base64').toString('utf-8');
        content += decodedPart;
      }
    }
    
    // Trim to reasonable size to avoid memory issues
    return content.substring(0, 10000); // Limit to 10KB per email
  } catch (error) {
    console.error('Error extracting email content:', error);
    return '';
  }
}

/**
 * Analyze email domain when no previous emails exist
 * @param {string} recipient - Email recipient
 * @returns {Promise<Object>} Style analysis object
 */
async function analyzeEmailDomain(recipient) {
  try {
    console.log(`Analyzing domain for recipient: ${recipient}`);
    
    // Extract domain from email
    const domain = recipient.split('@')[1] || '';
    
    // Use Gemini to analyze the domain
    const prompt = `
      Analyze this email domain: "${domain}"
      Based on just the domain, suggest:
      1. Is this likely a business, academic, personal, or government contact? 
      2. What tone would be appropriate (formal/semiformal/casual)?
      3. Suggest an appropriate greeting
      4. Suggest an appropriate closing
      5. Recommend a writing style
      
      Return as JSON: {
        "relationship": "business/academic/personal/government",
        "tone": "recommended tone",
        "greeting": "suggested greeting",
        "closing": "suggested closing",
        "style": "writing style recommendation",
        "context": {
          "previousTopics": ["general communication"],
          "ongoingContext": "No specific context known",
          "typicalPurpose": "general communication",
          "commonTerms": [],
          "relationshipDynamics": "professional relationship"
        }
      }
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    
    try {
      // Parse the JSON response
      const jsonMatch = response.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Email domain analysis JSON parsing error:', e);
    }
    
    // Use heuristics based on domain type
    if (domain.includes('gmail') || domain.includes('yahoo') || domain.includes('hotmail') || domain.includes('outlook.com')) {
      return {
        relationship: "personal",
        tone: "friendly",
        greeting: "Hi there,",
        closing: "Best,",
        style: "casual and conversational",
        context: {
          previousTopics: ["general communication"],
          ongoingContext: "No specific context known",
          typicalPurpose: "personal communication",
          commonTerms: ["best", "thanks", "appreciate"],
          relationshipDynamics: "personal relationship"
        }
      };
    } else if (domain.includes('edu')) {
      return {
        relationship: "academic",
        tone: "professional but approachable",
        greeting: "Hello,",
        closing: "Best regards,",
        style: "clear and structured",
        context: {
          previousTopics: ["academic matters"],
          ongoingContext: "Academic or educational context",
          typicalPurpose: "academic communication",
          commonTerms: ["study", "research", "academic"],
          relationshipDynamics: "academic relationship"
        }
      };
    } else if (domain.includes('gov')) {
      return {
        relationship: "government",
        tone: "formal",
        greeting: "Dear Sir/Madam,",
        closing: "Respectfully,",
        style: "precise and formal",
        context: {
          previousTopics: ["official matters"],
          ongoingContext: "Official or governmental context",
          typicalPurpose: "formal communication",
          commonTerms: ["official", "policy", "regarding"],
          relationshipDynamics: "official relationship"
        }
      };
    } else {
      return {
        relationship: "business",
        tone: "professional",
        greeting: "Hello,",
        closing: "Kind regards,",
        style: "concise and clear",
        context: {
          previousTopics: ["business matters"],
          ongoingContext: "Professional business context",
          typicalPurpose: "business communication",
          commonTerms: ["regarding", "business", "opportunity"],
          relationshipDynamics: "professional business relationship"
        }
      };
    }
  } catch (error) {
    console.error('Email style analysis error:', error);
    return {
      relationship: "unknown",
      tone: "professional",
      greeting: "Hello,",
      closing: "Best regards,",
      style: "concise and clear",
      context: {
        previousTopics: ["general communication"],
        ongoingContext: "No specific context known",
        typicalPurpose: "general communication",
        commonTerms: [],
        relationshipDynamics: "professional relationship"
      }
    };
  }
}

/**
 * Analyze email context based on previous emails
 * @param {string} recipient - Email recipient
 * @returns {Promise<Object>} Style analysis object
 */
async function analyzeEmailContext(recipient) {
  const cacheKey = `style_${recipient}`;
  
  // Check cache first for style analysis
  if (emailCache.has(cacheKey)) {
    const cachedData = emailCache.get(cacheKey);
    if (Date.now() - cachedData.timestamp < styleCacheExpiry) {
      console.log(`Using cached style analysis for ${recipient}`);
      return cachedData.style;
    }
  }
  
  try {
    console.log(`Analyzing previous emails sent to: ${recipient}`);
    
    // Try to get actual emails from Gmail
    const emails = await searchEmails(recipient, 15); // Limit to 15 for analysis
    
    if (emails.length > 0) {
      // Extract text content from emails - do this in batch to manage memory
      const emailTexts = emails.map(email => extractEmailContent(email))
        .filter(text => text.length > 0);
      
      if (emailTexts.length > 0) {
        console.log(`Successfully extracted text from ${emailTexts.length} emails`);
        
        // Sample first email text for debugging (truncated)
        if (emailTexts[0]) {
          console.log('Sample email content:');
          console.log(emailTexts[0].substring(0, 200) + '...');
        }
        
        // Combine and limit email content (handle larger datasets more efficiently)
        const combinedText = emailTexts.join('\n\n---\n\n');
        const truncatedText = combinedText.length > 8000 
          ? combinedText.substring(0, 8000) + `\n\n[Truncated - ${emailTexts.length} total emails]` 
          : combinedText;
        
        // Use Gemini to analyze actual email content
        const prompt = `
          Analyze these previous emails I've sent to ${recipient}:
          
          ${truncatedText}
          
          Based on these actual emails, extract:
          1. Common topics I've discussed with this person
          2. Ongoing conversations or context
          3. My typical email purpose with them
          4. My tone and formality level
          5. Specific vocabulary or terminology I commonly use
          6. My typical greeting style
          7. My typical closing style
          8. Inside jokes or references between us
          9. Any upcoming events or deadlines mentioned
          
          Return ONLY as JSON: {
            "relationship": "professional/personal/academic/etc",
            "tone": "observed tone",
            "greeting": "my typical greeting",
            "closing": "my typical closing",
            "style": "my writing style",
            "context": {
              "previousTopics": ["topic1", "topic2", "topic3"],
              "ongoingContext": "brief description of ongoing conversations",
              "typicalPurpose": "common purpose of my emails",
              "commonTerms": ["term1", "term2", "term3"],
              "relationshipDynamics": "description of relationship",
              "insideReferences": ["reference1", "reference2"],
              "upcomingEvents": ["event1", "event2"]
            }
          }
        `;
        
        // Add retry mechanism for model calls
        let attempts = 0;
        const maxAttempts = 3;
        
        while (attempts < maxAttempts) {
          try {
            const result = await model.generateContent(prompt);
            const response = result.response.text().trim();
            
            // Parse the JSON response
            const jsonMatch = response.match(/\{.*\}/s);
            if (jsonMatch) {
              const analysisData = JSON.parse(jsonMatch[0]);
              console.log("Email analysis complete using actual emails:");
              
              // Cache the result
              emailCache.set(cacheKey, { 
                style: analysisData, 
                timestamp: Date.now() 
              });
              
              return analysisData;
            }
            
            attempts++;
          } catch (error) {
            console.error(`Analysis attempt ${attempts} failed:`, error);
            attempts++;
            
            if (attempts < maxAttempts) {
              // Wait before retry (exponential backoff)
              await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
            }
          }
        }
      }
    }
    
    console.log("No emails found or unable to analyze. Using domain analysis fallback.");
    // Fallback to domain-based analysis
    const domainAnalysis = await analyzeEmailDomain(recipient);
    
    // Cache domain analysis too, but with shorter expiry
    emailCache.set(cacheKey, { 
      style: domainAnalysis, 
      timestamp: Date.now() - (styleCacheExpiry / 2) // Half expiry time for fallback
    });
    
    return domainAnalysis;
  } catch (error) {
    console.error('Error in email context analysis:', error);
    
    // Try to use cached data even if expired
    if (emailCache.has(cacheKey)) {
      console.log('Using expired cache due to error');
      return emailCache.get(cacheKey).style;
    }
    
    // Fallback to domain analysis
    return await analyzeEmailDomain(recipient);
  }
}

/**
 * Generate email draft based on recipient, purpose and style analysis
 * @param {string} recipient - Email recipient
 * @param {string} purpose - Email purpose
 * @param {Object} styleAnalysis - Style analysis object
 * @returns {Promise<Object>} Generated email with subject and body
 */
async function generateEmailDraft(recipient, purpose, styleAnalysis) {
  try {
    console.log("Generating personalized email based on analysis");
    
    // Create a more personalized prompt - optimize prompt size
    const previousTopics = styleAnalysis.context?.previousTopics?.slice(0, 3).join(', ') || 'None';
    const commonTerms = styleAnalysis.context?.commonTerms?.slice(0, 5).join(', ') || 'None';
    const insideReferences = styleAnalysis.context?.insideReferences?.slice(0, 2).join(', ') || 'None';
    
    const prompt = `
      Generate a complete, personalized email (with subject and body) for ${recipient} about: ${purpose}.
      
      Use these communication patterns from my previous emails:
      - Relationship: ${styleAnalysis.relationship}
      - Tone: ${styleAnalysis.tone}
      - My typical greeting: ${styleAnalysis.greeting}
      - My typical closing: ${styleAnalysis.closing}
      - My writing style: ${styleAnalysis.style}
      
      Previous context with this person:
      - Topics we've discussed: ${previousTopics}
      - Our ongoing conversations: ${styleAnalysis.context?.ongoingContext || 'None'}
      - How I typically email them: ${styleAnalysis.context?.typicalPurpose || 'General communication'}
      - Terms/phrases I commonly use: ${commonTerms}
      - Our relationship: ${styleAnalysis.context?.relationshipDynamics || 'Professional'}
      - Inside references between us: ${insideReferences}
      
      Important guidelines:
      1. Write as if I'm writing to this specific person with our existing relationship
      2. Make it sound natural and authentic, not a template
      3. Reference previous conversations naturally if relevant
      4. Format with "Subject:" on first line, then the email body
      5. Make the subject line specific and relevant
      6. Keep paragraphs concise and aligned with my writing style
      
      Generate the complete email (subject and body):
    `;
    
    // Add retry mechanism for generation
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent(prompt);
        const generatedText = result.response.text().trim();
        
        // Extract subject and body from generated text
        let subject = '';
        let body = generatedText;
        
        if (generatedText.startsWith('Subject:')) {
          const parts = generatedText.split('\n');
          subject = parts[0].replace('Subject:', '').trim();
          body = parts.slice(2).join('\n'); // Skip the subject line and the blank line
        }
        
        if (!subject) {
          // Generate a subject if missing
          subject = `Re: ${purpose}`;
        }
        
        console.log("Generated subject:", subject);
        console.log("Generated body sample:", body.substring(0, 100) + "...");
        
        return { subject, body };
      } catch (error) {
        console.error(`Email generation attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        if (attempts < maxAttempts) {
          // Wait before retry (exponential backoff)
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
        }
      }
    }
    
    throw new Error('Failed to generate email after multiple attempts');
  } catch (error) {
    console.error('Email generation error:', error);
    
    // Fallback template if generation fails
    const greeting = styleAnalysis?.greeting || "Hi there,";
    const closing = styleAnalysis?.closing || "Best regards,\nAI Assistant";
    const subject = `Regarding: ${purpose}`;
    const body = `${greeting}\n\nI'm writing about ${purpose}.\n\n${closing}`;
    
    return { subject, body };
  }
}

/**
 * Generate humanized email draft with better context handling
 * @param {string} recipient - Email recipient
 * @param {string} purpose - Email purpose
 * @param {Object} styleAnalysis - Style analysis object
 * @returns {Promise<Object>} Generated email with subject and body
 */
async function generateHumanizedEmail(recipient, purpose, styleAnalysis) {
  try {
    console.log("Generating human-like email based on purpose:", purpose);
    
    // Check if purpose contains enough context or if we need more information
    const contextAnalysis = await analyzeContextCompleteness(recipient, purpose);
    
    // Create the context-aware prompt for email generation
    const prompt = `
      Generate a very natural, human-sounding email to ${recipient} about: ${purpose}.
      
      My writing style based on previous emails:
      - I typically use this greeting: ${styleAnalysis.greeting}
      - I typically use this closing: ${styleAnalysis.closing}
      - My writing tone is: ${styleAnalysis.tone}
      - My relationship with this person is: ${styleAnalysis.relationship}
      
      Previous context with this person:
      ${styleAnalysis.context?.previousTopics?.length > 0 ? `- We've previously discussed: ${styleAnalysis.context.previousTopics.join(', ')}` : ''}
      ${styleAnalysis.context?.ongoingContext ? `- Ongoing conversation: ${styleAnalysis.context.ongoingContext}` : ''}
      ${styleAnalysis.context?.commonTerms?.length > 0 ? `- I often use phrases like: ${styleAnalysis.context.commonTerms.join(', ')}` : ''}
      
      Important:
      ${contextAnalysis.missingInfo ? `- This purpose is missing some context: ${contextAnalysis.missingInfo}
      - Handle the gaps naturally, as a human would, without explicitly mentioning anything is missing
      - Use general language that works without the specific details` : '- The purpose has sufficient context'}
      
      Email writing guidelines:
      1. Write like a real human - include small imperfections, casual language, contractions
      2. Don't be overly formal or template-like - be conversational and authentic
      3. Don't say "I hope this email finds you well" or similar clichés unless that's my actual style
      4. If referencing something we've discussed before, be specific but natural
      5. Include a natural-sounding subject line that would make sense to the recipient
      6. Don't explain that you're emailing, just get to the point naturally
      7. Format with "Subject:" on the first line, followed by the body starting with my typical greeting
      
      Write the complete email now:
    `;
    
    // Generate with retry mechanism
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const result = await model.generateContent(prompt);
        const generatedText = result.response.text().trim();
        
        // Extract subject and body
        let subject = '';
        let body = generatedText;
        
        if (generatedText.startsWith('Subject:')) {
          const parts = generatedText.split('\n');
          subject = parts[0].replace('Subject:', '').trim();
          
          // Get the body starting from line after subject
          const bodyStartIndex = parts.findIndex((line, index) => index > 0 && line.trim().length > 0);
          if (bodyStartIndex > 0) {
            body = parts.slice(bodyStartIndex).join('\n');
          }
        }
        
        // Generate subject if missing
        if (!subject) {
          subject = await generateNaturalSubject(purpose, contextAnalysis);
        }
        
        console.log("Generated subject:", subject);
        console.log("Generated body sample:", body.substring(0, 100) + "...");
        
        return { subject, body };
      } catch (error) {
        console.error(`Email generation attempt ${attempts + 1} failed:`, error);
        attempts++;
        
        if (attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempts)));
        }
      }
    }
    
    throw new Error('Failed to generate email after multiple attempts');
  } catch (error) {
    console.error('Humanized email generation error:', error);
    
    // Fallback to more natural template if generation fails
    const greeting = styleAnalysis?.greeting || "Hey,";
    const closing = styleAnalysis?.closing || "Talk soon,";
    const subject = `About ${purpose.split(' ').slice(0, 4).join(' ')}...`;
    
    // Create a more natural fallback
    const body = `${greeting}

Just wanted to let you know about ${purpose}. ${contextAnalysis.missingInfo ? "I can fill you in on more details when we talk." : ""}

${closing}`;
    
    return { subject, body };
  }
}

/**
 * Analyze whether the purpose has enough context
 * @param {string} recipient - Email recipient
 * @param {string} purpose - Email purpose
 * @returns {Promise<Object>} Context analysis result
 */
async function analyzeContextCompleteness(recipient, purpose) {
  try {
    const prompt = `
      Analyze this email purpose: "${purpose}"
      
      Check if important context is missing that would be needed to write a complete email.
      For example, check for:
      - Missing names (who is "he/she/they/him/her"?)
      - Missing specific details (what plan? which meeting? what time?)
      - Vague references that need clarification

      Return as JSON: {
        "hasAllContext": true/false,
        "missingInfo": "description of what's missing or null if nothing is missing",
        "suggestedApproach": "how to handle writing the email given the available context"
      }
    `;
    
    const result = await model.generateContent(prompt);
    const response = result.response.text().trim();
    
    try {
      const jsonMatch = response.match(/\{.*\}/s);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('Context analysis JSON parsing error:', e);
    }
    
    // Basic fallback analysis
    const missingContextPatterns = [
      { pattern: /\b(he|she|they|him|her|them)\b/i, issue: "who this person is" },
      { pattern: /\b(the plan|our plan)\b/i, issue: "which plan specifically" },
      { pattern: /\b(the meeting|our meeting)\b/i, issue: "which meeting" },
      { pattern: /\b(the teacher|a teacher)\b/i, issue: "which teacher" },
    ];
    
    for (const { pattern, issue } of missingContextPatterns) {
      if (pattern.test(purpose)) {
        return {
          hasAllContext: false,
          missingInfo: issue,
          suggestedApproach: "Write naturally and be general where specific details aren't available"
        };
      }
    }
    
    return {
      hasAllContext: true,
      missingInfo: null,
      suggestedApproach: "Proceed with all available context"
    };
  } catch (error) {
    console.error('Context completeness analysis error:', error);
    return {
      hasAllContext: true,
      missingInfo: null,
      suggestedApproach: "Proceed with caution"
    };
  }
}

/**
 * Generate a natural-sounding subject line
 * @param {string} purpose - Email purpose
 * @param {Object} contextAnalysis - Context analysis result
 * @returns {Promise<string>} Generated subject line
 */
async function generateNaturalSubject(purpose, contextAnalysis) {
  try {
    const prompt = `
      Generate a natural, human-sounding email subject line for this purpose:
      "${purpose}"
      
      Make it sound like a real person wrote it:
      - Keep it short (3-7 words ideally)
      - Make it conversational, not formal
      - Don't use unnecessary capitalization
      - Include only essential information
      - Don't include prefixes like "Re:" or "Subject:"
      
      Return ONLY the subject line text.
    `;
    
    const result = await model.generateContent(prompt);
    return result.response.text().trim();
  } catch (error) {
    console.error('Subject generation error:', error);
    
    // Simple fallback that sounds natural
    const firstFewWords = purpose.split(' ').slice(0, 3).join(' ');
    return `Quick update - ${firstFewWords}...`;
  }
}

/**
 * Cache cleanup to prevent memory leaks
 */
function cleanupCache() {
  const now = Date.now();
  let expiredCount = 0;
  
  // Clean email cache
  for (const [key, value] of emailCache.entries()) {
    // Email data cache: 10 minutes
    // Style cache: 1 hour (set by styleCacheExpiry)
    const maxAge = key.startsWith('emails_') ? 10 * 60 * 1000 : styleCacheExpiry;
    
    if (now - value.timestamp > maxAge) {
      emailCache.delete(key);
      expiredCount++;
    }
  }
  
  if (expiredCount > 0) {
    console.log(`Cleaned up ${expiredCount} expired cache entries`);
  }
}

/**
 * Check if user is in an email flow
 * @returns {boolean} True if in email flow
 */
function isInEmailFlow() {
  return emailState.active;
}

/**
 * Handle email intent
 * @param {string} userInput - User input text
 * @param {Object} entities - Extracted entities
 * @returns {Promise<string>} Response to user
 */
async function handleEmailIntent(userInput, entities) {
  // Track performance
  const startTime = Date.now();
  
  try {
    // Check if we're starting a new email flow
    if (!emailState.active) {
      // Starting a new email flow
      emailState.active = true;
      emailState.stage = 'collecting_purpose';
      emailState.data = {
        to: entities.to === 'MISSING' ? '' : entities.to,
        subject: '',
        body: '',
        purpose: '',
        styleAnalysis: null,
        startTime: Date.now() // Track when this flow started
      };
      
      // If we already have the recipient, move to purpose
      if (emailState.data.to && emailState.data.to !== '') {
        console.log(`Starting email flow for recipient: ${emailState.data.to}`);
        return "Great, I'll help you draft an email to " + emailState.data.to + ". What's the purpose of this email?";
      } else {
        // Ask for the recipient first
        emailState.stage = 'collecting_recipient';
        return "Who would you like to send an email to? (Please provide their email address)";
      }
    }
    
    // Auto-cleanup for stale email sessions (15 minutes)
    if (Date.now() - emailState.data.startTime > 15 * 60 * 1000) {
      console.log('Email session timed out, resetting');
      emailState = {
        active: false,
        stage: 'init',
        data: { to: '', subject: '', body: '', purpose: '', styleAnalysis: null }
      };
      
      return "It looks like our email drafting session timed out. Let's start over. What would you like to do?";
    }
    
    // Process based on current stage with improved error handling
    switch(emailState.stage) {
      case 'collecting_recipient':
        // Extract email from user input
        const emailMatch = userInput.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) {
          emailState.data.to = emailMatch[0];
          emailState.stage = 'collecting_purpose';
          console.log(`Email recipient set to: ${emailState.data.to}`);
          return `Thanks! What's the purpose of your email to ${emailState.data.to}?`;
        } else {
          return "I didn't catch a valid email address. Please provide a full email address like example@domain.com";
        }
        
      case 'collecting_purpose':
        // User provided the purpose, generate the email
        emailState.data.purpose = userInput.trim();
        emailState.stage = 'checking_context';
        
        console.log("Analyzing if we have enough context for:", emailState.data.purpose);
        
        // Analyze if we need more context
        const contextAnalysis = await analyzeContextCompleteness(
          emailState.data.to,
          emailState.data.purpose
        );
        
        // If important context is missing, ask for it
        if (!contextAnalysis.hasAllContext && contextAnalysis.missingInfo) {
          emailState.stage = 'collecting_context';
          emailState.data.contextAnalysis = contextAnalysis;
          
          return `I can draft that email, but could you clarify ${contextAnalysis.missingInfo}? This will help me write a more specific message.`;
        } else {
          // We have enough context, proceed to generation
          emailState.stage = 'generating';
          return await proceedToEmailGeneration(emailState);
        }
      
      case 'collecting_context':
        // User provided more context, update the purpose
        emailState.data.purpose += " " + userInput.trim();
        emailState.stage = 'generating';
        
        // Now generate with the enhanced context
        return await proceedToEmailGeneration(emailState);
        
      case 'confirming':
        if (userInput.toLowerCase().includes('yes')) {
          // Send the email
          try {
            const result = await sendEmail(emailState.data.to, emailState.data.subject, emailState.data.body);
            
            // Reset the email state
            emailState = {
              active: false,
              stage: 'init',
              data: { to: '', subject: '', body: '', purpose: '', styleAnalysis: null }
            };
            
            return result;
          } catch (error) {
            console.error("Error sending email:", error);
            return "I encountered an issue sending your email. Please try again.";
          }
        } else if (userInput.toLowerCase().includes('no')) {
          // Ask what they want to change
          emailState.stage = 'editing';
          return "Would you like to edit the email, change the recipient, or cancel?";
        } else {
          return "Please confirm with 'yes' to send the email or 'no' to make changes.";
        }
        
      case 'editing':
        if (userInput.toLowerCase().includes('edit')) {
          emailState.stage = 'collecting_purpose';
          return "Please describe again what you want to say in this email.";
        } else if (userInput.toLowerCase().includes('recipient') || userInput.toLowerCase().includes('to')) {
          emailState.stage = 'collecting_recipient';
          return "Who would you like to send this email to instead?";
        } else if (userInput.toLowerCase().includes('cancel')) {
          // Cancel the email
          emailState = {
            active: false,
            stage: 'init',
            data: { to: '', subject: '', body: '', purpose: '', styleAnalysis: null }
          };
          return "Email canceled. What else can I help you with?";
        } else {
          return "Would you like to edit the email content, change the recipient, or cancel?";
        }
        
      case 'generating':
        return "I'm working on your email draft, please wait a moment...";
        
      default:
        // Safety fallback for unknown state
        emailState = {
          active: false,
          stage: 'init',
          data: { to: '', subject: '', body: '', purpose: '', styleAnalysis: null }
        };
        return "I seem to have lost track of our email drafting. Let's start over. Would you like to send an email?";
    }
  } catch (error) {
    console.error("Unexpected error in email flow:", error);
    
    // Reset state on unexpected error
    emailState = {
      active: false,
      stage: 'init',
      data: { to: '', subject: '', body: '', purpose: '', styleAnalysis: null }
    };
    
    return "I encountered an unexpected error while working on your email. Let's start over. What would you like to do?";
  }
}

/**
 * Helper function for email generation to avoid code duplication
 * @param {Object} state - Email state object
 * @returns {Promise<string>} Response to user
 */
async function proceedToEmailGeneration(state) {
  // Show a processing message immediately
  setTimeout(() => {
    console.log("Starting email analysis and generation process...");
  }, 0);
  
  try {
    // Start style analysis
    console.log("Analyzing email style for", state.data.to);
    const styleAnalysisPromise = analyzeEmailContext(state.data.to);
    
    // While waiting for analysis to complete, log progress
    const logInterval = setInterval(() => {
      console.log("Email analysis in progress...");
    }, 3000);
    
    // Get style analysis result
    state.data.styleAnalysis = await styleAnalysisPromise;
    
    // Stop progress logging
    clearInterval(logInterval);
    
    // Generate personalized, humanized email draft
    console.log("Generating humanized email for purpose:", state.data.purpose);
    const generated = await generateHumanizedEmail(
      state.data.to,
      state.data.purpose,
      state.data.styleAnalysis
    );
    
    state.data.subject = generated.subject;
    state.data.body = generated.body;
    state.stage = 'confirming';
    
    return `Here's your personalized email draft:\n\nTo: ${state.data.to}\nSubject: ${state.data.subject}\n\n${state.data.body}\n\nShould I send this email? (yes/no)`;
  } catch (error) {
    console.error("Error in email generation process:", error);
    state.stage = 'collecting_purpose';
    return "I encountered an issue creating your email. Could you please describe the purpose again?";
  }
}

// Run cache cleanup every 30 minutes
setInterval(cleanupCache, 30 * 60 * 1000);

// Export functions
module.exports = {
  isInEmailFlow,
  handleEmailIntent,
  analyzeEmailContext,
  generateEmailDraft,
  generateHumanizedEmail,
  analyzeContextCompleteness,
  searchEmails,
  extractEmailContent
};