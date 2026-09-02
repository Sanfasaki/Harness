import { useEffect, useRef, useState } from "react";

/**
 * 可复用的鼠标拖尾轨迹组件
 * 用法：在页面容器内渲染 <CursorTrail color="#fff" />
 * 注意：父容器需要开启 relative 定位
 *
 * @param {string} color - 轨迹光点颜色，默认白色
 * @param {number} size - 轨迹光点初始尺寸，默认 16px
 * @param {number} duration - 轨迹存活时长（毫秒），默认 800ms
 */
const CursorTrail = ({ color = "rgba(255,255,255,0.8)", size = 16, duration = 800 }) => {
  const [trail, setTrail] = useState([]);
  const trailRef = useRef([]);
  const containerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    // 动画循环：更新轨迹点的缩小与淡出
    const animate = () => {
      const now = Date.now();
      setTrail(
        trailRef.current
          .map((point) => {
            const progress = Math.min((now - point.createdAt) / duration, 1);
            const easeOut = 1 - Math.pow(1 - progress, 3);
            return { ...point, size: size * (1 - easeOut), opacity: 1 - easeOut };
          })
          .filter((point) => now - point.createdAt < duration)
      );
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);

    // 鼠标移动时节流添加新轨迹点（每 16ms 一个）
    const handleMouseMove = (e) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const now = Date.now();
      const last = trailRef.current[trailRef.current.length - 1];
      if (last && now - last.createdAt <= 16) return;

      const newPoint = { id: now, x: e.clientX - rect.left, y: e.clientY - rect.top, createdAt: now };
      trailRef.current = [...trailRef.current, newPoint].slice(-12);
    };

    document.addEventListener("mousemove", handleMouseMove);
    // 组件卸载时清理动画与事件监听
    return () => {
      cancelAnimationFrame(frameRef.current);
      document.removeEventListener("mousemove", handleMouseMove);
    };
  }, [size, duration]);

  return (
    <div ref={containerRef} className="absolute inset-0 pointer-events-none overflow-hidden">
      {trail.map((point) => (
        <div
          key={point.id}
          className="absolute rounded-full"
          style={{
            left: point.x - point.size / 2,
            top: point.y - point.size / 2,
            width: point.size,
            height: point.size,
            opacity: point.opacity,
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}`,
          }}
        />
      ))}
    </div>
  );
};

export default CursorTrail;
