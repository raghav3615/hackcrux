import { Plus } from 'lucide-react';

const Sidebar = ({ currentUser, chats, onNewChat }) => {
  return (
    <div className="w-[260px] bg-white border-r border-gray-100 flex flex-col h-screen">
      {/* User Profile */}
      <div className="p-3 flex items-center gap-2 border-b border-gray-100">
        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden">
          {currentUser?.avatar ? (
            <img src={currentUser.avatar} alt={currentUser.name} className="w-full h-full object-cover" />
          ) : (
            <span className="text-sm text-gray-500">{currentUser?.name?.charAt(0)}</span>
          )}
        </div>
        <span className="text-sm text-gray-700">@{currentUser?.username || 'Raghav'}</span>
      </div>

      {/* New Chat Button */}
      <div className="p-2">
        <button
          onClick={onNewChat}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 rounded-md"
        >
          <Plus size={16} />
          <span>New Chat</span>
        </button>
      </div>

      {/* Chat History */}
      <div className="flex-1 overflow-y-auto">
        <div className="px-3 py-2">
          <div className="text-xs font-medium text-gray-400 mb-2">TODAY</div>
          {chats?.today?.map((chat) => (
            <div
              key={chat.id}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md cursor-pointer truncate"
            >
              {chat.title}
            </div>
          ))}
        </div>

        <div className="px-3 py-2">
          <div className="text-xs font-medium text-gray-400 mb-2">YESTERDAY</div>
          {chats?.yesterday?.map((chat) => (
            <div
              key={chat.id}
              className="px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md cursor-pointer truncate"
            >
              {chat.title}
            </div>
          ))}
        </div>
      </div>

      {/* Settings */}
      <div className="border-t border-gray-100 p-2">
        <button className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md">
          Settings
        </button>
        <button className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md">
          Download for iOS
        </button>
        <button className="w-full text-left px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 rounded-md">
          AI Policy
        </button>
      </div>
    </div>
  );
};

export default Sidebar; 