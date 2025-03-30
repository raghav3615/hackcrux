const FeatureCard = ({ title, icon: Icon, gradient, onClick }) => {
  return (
    <div 
      onClick={onClick}
      className="feature-card group relative overflow-hidden backdrop-blur-lg"
      style={{
        background: `linear-gradient(45deg, ${gradient[0]}, ${gradient[1]})`
      }}
    >
      <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors"></div>
      <div className="relative z-10">
        <div className="flex flex-col h-full justify-between">
          <div className="text-lg font-medium text-white mb-4">{title}</div>
          <div className="w-16 h-16 bg-white/10 rounded-lg p-3 backdrop-blur-sm group-hover:bg-white/20 transition-colors">
            <Icon className="w-full h-full text-white" />
          </div>
        </div>
      </div>
      
      {/* Shimmer Effect */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000"></div>
    </div>
  );
};

export default FeatureCard; 