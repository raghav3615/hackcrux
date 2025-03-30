import { useState, useEffect } from "react";
import { Sparkles, Search, Mail, Calendar, ArrowRight, CheckCircle } from "lucide-react";

// Enhanced feature card with more professional styling
const FeatureCard = ({ title, description, icon: Icon, onClick }) => {
  return (
    <div 
      className="relative group cursor-pointer transition-all duration-300 transform hover:scale-[1.03] hover:-translate-y-1"
      onClick={onClick}
    >
      <div 
        className="aspect-[1.4] rounded-xl p-6 flex flex-col justify-between border border-gray-200 bg-white shadow-md"
      >
        {/* Enhanced gradient background on hover */}
        <div 
          className="absolute inset-0 bg-gradient-to-r from-orange-50 via-white to-orange-50 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"
          style={{ backgroundSize: "200% 100%", animation: "shimmer 2s infinite" }}
        ></div>
        
        {/* Card highlight effect */}
        <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-all duration-500 pointer-events-none" 
             style={{ boxShadow: "0 0 0 2px rgba(249, 115, 22, 0.4), 0 12px 24px -12px rgba(249, 115, 22, 0.5)" }}></div>
        
        {/* Content */}
        <div className="relative">
          <div 
            className="mb-4 w-14 h-14 rounded-xl flex items-center justify-center text-white shadow-md 
                      group-hover:shadow-orange-200 transition-all duration-300"
            style={{ 
              background: "linear-gradient(135deg, #f97316, #ea580c)",
              boxShadow: "0 6px 12px -6px rgba(249, 115, 22, 0.5)"
            }}
          >
            <Icon className="w-6 h-6" />
          </div>
          
          <div className="text-xl font-bold text-gray-900 mb-2">{title}</div>
          <div className="text-sm text-gray-600">{description}</div>
        </div>
        
        <div className="relative flex items-center text-sm font-semibold text-orange-600 group-hover:text-orange-700 transition-colors mt-4">
          <span>Try this</span>
          <ArrowRight className="w-4 h-4 ml-1.5 transform group-hover:translate-x-1.5 transition-transform duration-300" />
        </div>
      </div>
    </div>
  );
};

const BlankPage = ({ onSelectPrompt }) => {
  // Features with updated prompts as specified
  const features = [
    {
      title: "Deep Research",
      description: "Analyze topics with comprehensive insights and data points",
      icon: Search,
      prompt: "Do a research on ",
      id: "research"
    },
    {
      title: "Draft Email",
      description: "Compose professional emails with the right tone and structure",
      icon: Mail,
      prompt: "Send an Email to ",
      id: "email"
    },
    {
      title: "Schedule Event",
      description: "Plan and organize your next meeting or event efficiently",
      icon: Calendar,
      prompt: "Schedule the Event on ",
      id: "calendar"
    }
  ];

  const [typingText] = useState("Ask me anything about design...");
  const [, setTypingIndex] = useState(0);
  
  // Typing animation effect
  useEffect(() => {
    const interval = setInterval(() => {
      setTypingIndex(prevIndex => {
        if (prevIndex >= typingText.length) {
          setTimeout(() => {
            setTypingIndex(0);
          }, 2000);
          return prevIndex;
        }
        return prevIndex + 1;
      });
    }, 100);
    
    return () => clearInterval(interval);
  }, [typingText]);

  return (
    <div className="py-12 px-6 max-w-5xl mx-auto relative">
      {/* Welcome Text with enhanced styling */}
      <div className="text-center mb-16 relative">
        <div className="inline-flex items-center px-4 py-2 mb-5 bg-orange-50 rounded-full border border-orange-200 shadow-sm">
          <Sparkles className="w-4 h-4 text-orange-500 mr-2" />
          <p className="text-orange-700 font-semibold text-sm tracking-wide">AI ASSISTANT</p>
        </div>
        
        <h2 className="text-5xl font-extrabold mb-6 text-gray-900 leading-tight">
          What would you like to <span className="text-orange-600">do today</span>?
        </h2>
        
      </div>

      {/* Feature Cards with enhanced layout */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
        {features.map((feature) => (
          <FeatureCard 
            key={feature.id} 
            {...feature} 
            onClick={() => onSelectPrompt && onSelectPrompt(feature.prompt)}
          />
        ))}
      </div>

      {/* Custom styles for shimmer animation */}
      <style jsx>{`
        @keyframes shimmer {
          0% { background-position: 0% 0%; }
          100% { background-position: 200% 0%; }
        }
      `}</style>
    </div>
  );
};

export default BlankPage;