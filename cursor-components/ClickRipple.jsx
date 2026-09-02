import { useEffect, useRef, useState } from "react";

/**
 * 可复用的鼠标点击波纹组件
 * 用法：在页面容器内渲染 <ClickRipple color="rgba(255,255,255,0.8)" />
 * 注意：父容器需要开启 relative 定位
 *
 * @param {string} color - 波纹颜色，默认白色带光晕
 * @param {number} maxSize - 波纹最大扩散尺寸，默认 120px
 * @param {number} duration - 波纹存活时长（毫秒），默认 1000ms
 * @param {number} borderWidth - 波纹边框粗细，默认 2px
 */
const ClickRipple = ({
  color = "rgba(255,255,255,0.8)",
  maxSize = 120,
  duration = 1000,
  borderWidth = 2,
}) => {
  const [ripples, setRipples] = useState([]);
  const ripplesRef = useRef([]);
  const idRef = useRef(0);
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    // 动画循环：根据存活进度让波纹扩大并淡出
    const animate = () => {
      const now = Date.now();
      setRipples(
        ripplesRef.current
          .map((ripple) => {
            const progress = Math.min((now - ripple.createdAt) / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            return {
              ...ripple,
              size: maxSize * easeOut,
              opacity: 0.8 * (1 - progress),
            };
          })
          .filter((ripple) => now - ripple.createdAt < duration)
      );
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    // 监听点击，在点击位置生成一个新波纹
    const handleClick = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newRipple = {
        id: idRef.current++,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
        createdAt: Date.now(),
      };
      ripplesRef.current = [...ripplesRef.current, newRipple];
    };

    document.addEventListener("click", handleClick);
    // 组件卸载时清理动画与事件监听
    return () => {
      cancelAnimationFrame(frameRef.current);
      document.removeEventListener("click", handleClick);
    };
  }, [maxSize, duration]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {ripples.map((ripple) => (
        <div
          key={ripple.id}
          className="absolute rounded-full"
          style={{
            left: ripple.x - ripple.size / 2,
            top: ripple.y - ripple.size / 2,
            width: ripple.size,
            height: ripple.size,
            opacity: ripple.opacity,
            border: `${borderWidth}px solid ${color}`,
          }}
        />
      ))}
    </div>
  );
};

export default ClickRipple;
