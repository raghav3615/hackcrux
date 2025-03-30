import { useState, useEffect, useRef } from 'react';
import { ArrowRight, Mic, Paperclip, Image, X, Sparkles } from 'lucide-react';

const ChatInput = ({ value, onChange, onSubmit, typingPrompt }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [attachments, setAttachments] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [typingIndex, setTypingIndex] = useState(0);
  const inputRef = useRef(null);

  const handleAttachment = (type) => {
    // Simulate adding an attachment
    const newAttachment = { 
      id: Date.now(), 
      type, 
      name: type === 'image' ? 'image.jpg' : 'document.pdf'
    };
    setAttachments([...attachments, newAttachment]);
  };

  const removeAttachment = (id) => {
    setAttachments(attachments.filter(attachment => attachment.id !== id));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  // Animation effect for typing the prompt
  useEffect(() => {
    if (!typingPrompt) return;
    
    // Reset and start new typing animation
    setIsTyping(true);
    setTypingIndex(0);
    onChange(""); // Clear existing input

    // Focus the input
    if (inputRef.current) {
      inputRef.current.focus();
    }
    
    const interval = setInterval(() => {
      setTypingIndex(prevIndex => {
        if (prevIndex >= typingPrompt.length) {
          setIsTyping(false);
          clearInterval(interval);
          return prevIndex;
        }
        
        // Update the input value with the next character
        onChange(typingPrompt.substring(0, prevIndex + 1));
        return prevIndex + 1;
      });
    }, 25); // Speed of typing animation
    
    return () => clearInterval(interval);
  }, [typingPrompt, onChange]);

  return (
    <div className="max-w-3xl mx-auto w-full px-4 pb-4">
      {/* Attachments preview */}
      {attachments.length > 0 && (
        <div className="flex gap-2 mb-2 p-2 bg-gray-50 rounded-lg border border-gray-200 overflow-x-auto">
          {attachments.map(attachment => (
            <div key={attachment.id} className="relative flex-shrink-0">
              <div className="bg-white p-2 rounded border border-gray-200 flex items-center gap-2 text-sm">
                {attachment.type === 'image' ? (
                  <Image size={14} className="text-orange-500" />
                ) : (
                  <Paperclip size={14} className="text-orange-500" />
                )}
                <span className="text-gray-700 max-w-[100px] truncate">{attachment.name}</span>
                <button 
                  onClick={() => removeAttachment(attachment.id)}
                  className="p-0.5 hover:bg-gray-100 rounded-full"
                >
                  <X size={14} className="text-gray-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Input form with enhanced styling */}
      <form 
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="relative"
      >
        <input
          ref={inputRef}
          type="text"
          placeholder="Ask anything or type / for commands..."
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          className={`w-full bg-white border border-gray-200 shadow-sm rounded-xl py-3.5 px-4 pr-24 text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-orange-100 focus:border-orange-300 transition-all ${isTyping ? 'caret-orange-500 animate-cursor-blink' : ''}`}
          readOnly={isTyping} // Prevent user input during typing animation
        />
        
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
          {/* Feature buttons with tooltips */}
          <button 
            type="button"
            onClick={() => handleAttachment('file')}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Attach file"
            title="Attach file"
          >
            <Paperclip size={16} />
          </button>
          
          <button 
            type="button"
            onClick={() => handleAttachment('image')}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Attach image"
            title="Attach image"
          >
            <Image size={16} />
          </button>
          
          <button 
            type="button"
            onClick={() => setIsRecording(!isRecording)}
            className={`p-1.5 rounded-lg transition-colors ${
              isRecording 
                ? "bg-red-100 text-red-600" 
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
            aria-label="Voice input"
            title="Voice input"
          >
            <Mic size={16} />
          </button>
          
          <div className="w-px h-5 bg-gray-200 mx-0.5"></div>
          
          <button 
            type="submit"
            className="p-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors shadow-sm"
            aria-label="Send message"
            disabled={isTyping} // Disable during typing animation
          >
            <ArrowRight size={16} />
          </button>
        </div>
      </form>

      {/* Custom styles for cursor blink animation */}
      <style jsx>{`
        @keyframes cursor-blink {
          0%, 100% { caret-color: transparent; }
          50% { caret-color: #f97316; }
        }
        
        .animate-cursor-blink {
          animation: cursor-blink 0.8s infinite;
        }
      `}</style>
    </div>
  );
};

export default ChatInput;