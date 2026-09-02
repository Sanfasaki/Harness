import { useEffect, useRef } from "react";

/**
 * 可复用的自定义光标组件
 * 用法：在任意页面根部渲染 <CustomCursor imageSrc="光标图片地址" />
 *
 * @param {string} imageSrc - 光标图片地址（建议使用透明背景的 PNG）
 * @param {number} size - 光标尺寸，默认 64px
 * @param {number} scale - 悬停可点击元素时的放大倍数，默认 1.5
 */
const CustomCursor = ({ imageSrc, size = 64, scale = 1.5 }) => {
  const cursorRef = useRef(null);

  useEffect(() => {
    const cursor = cursorRef.current;
    if (!cursor) return;

    // 更新光标位置
    const handleMouseMove = (e) => {
      cursor.style.left = e.clientX + "px";
      cursor.style.top = e.clientY + "px";
    };

    // 鼠标进入/离开窗口时显示/隐藏光标
    const handleMouseEnter = () => (cursor.style.display = "block");
    const handleMouseLeave = () => (cursor.style.display = "none");

    // 悬停可点击元素时光标放大
    const handleMouseOver = (e) => {
      const isClickable = e.target.closest(
        'a, button, [role="button"], input[type="submit"], input[type="button"], input[type="reset"]'
      );
      cursor.style.transform = isClickable
        ? `translate(-50%, -50%) scale(${scale})`
        : "translate(-50%, -50%)";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseenter", handleMouseEnter);
    document.addEventListener("mouseleave", handleMouseLeave);
    document.addEventListener("mouseover", handleMouseOver);

    // 组件卸载时清理事件监听
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseenter", handleMouseEnter);
      document.removeEventListener("mouseleave", handleMouseLeave);
      document.removeEventListener("mouseover", handleMouseOver);
    };
  }, [scale]);

  return (
    <div
      ref={cursorRef}
      className="custom-cursor"
      style={{
        position: "fixed",
        width: size,
        height: size,
        pointerEvents: "none",
        zIndex: 9999,
        backgroundImage: `url('${imageSrc}')`,
        backgroundSize: "contain",
        backgroundRepeat: "no-repeat",
        transform: "translate(-50%, -50%)",
        transition: "transform 0.1s ease",
      }}
    />
  );
};

export default CustomCursor;
