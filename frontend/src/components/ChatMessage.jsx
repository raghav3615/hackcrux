const ChatMessage = ({ message, isUser }) => {
  return (
    <div className={`py-8 ${isUser ? 'bg-white' : 'bg-gray-50'}`}>
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex gap-4">
          {/* Avatar */}
          <div className="w-8 h-8 rounded-full bg-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
            {isUser ? (
              <span className="text-sm text-gray-500">U</span>
            ) : (
              <span className="text-sm text-gray-500">AI</span>
            )}
          </div>
          
          {/* Message Content */}
          <div className="flex-1">
            <div className="prose prose-gray max-w-none">
              {message}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChatMessage; 