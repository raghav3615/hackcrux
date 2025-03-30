import { ChevronDown, Share2 } from 'lucide-react';

const Header = ({ model = "Open AI GPT-4.0", onShare, onReport }) => {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white">
      <div className="flex items-center gap-2">
       
      </div>
      
      <div className="flex items-center gap-2">
        
        <button 
          onClick={onShare}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-orange-500 text-white hover:bg-orange-600 rounded-md"
        >
          <Share2 size={14} />
          Share
        </button>
      </div>
    </div>
  );
};

export default Header; 