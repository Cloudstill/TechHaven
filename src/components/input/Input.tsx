import React, {
  useState,
  useImperativeHandle,
  useRef,
  forwardRef,
  type KeyboardEvent,
  type MouseEvent,
  type FocusEvent,
  type ChangeEvent,
  type ReactNode,
  type ForwardedRef,
} from "react";
import styles from "./Input.module.css"; // 导入CSS Module

// 定义组件属性类型
interface InputProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, event: ChangeEvent<HTMLInputElement>) => void;
  onPressEnter?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onClear?: () => void;
  size?: "small" | "default" | "large";
  prefix?: ReactNode;
  suffix?: ReactNode;
  allowClear?: boolean;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  style?: React.CSSProperties;
  onKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void;
  onFocus?: (event: FocusEvent<HTMLInputElement>) => void;
  onBlur?: (event: FocusEvent<HTMLInputElement>) => void;
  // 其他原生input属性
  type?: string;
  autoFocus?: boolean;
  maxLength?: number;
  min?: string | number;
  max?: string | number;
  step?: string | number;
  pattern?: string;
  readOnly?: boolean;
  required?: boolean;
  name?: string;
  id?: string;
  /** 原生 autocomplete；密钥类输入应传 "new-password" 避免浏览器密码管理器收藏 */
  autoComplete?: string;
}

// 定义通过ref暴露的方法
export interface InputRef {
  getInput: () => HTMLInputElement | null;
  focus: () => void;
  blur: () => void;
}

const Input = forwardRef<InputRef, InputProps>((props, ref: ForwardedRef<InputRef>) => {
  // 从props中解构所需属性和默认值
  const {
    value: propsValue,
    defaultValue = "",
    onChange,
    onPressEnter,
    onClear,
    size = "default",
    prefix,
    suffix,
    allowClear = false,
    loading = false,
    disabled = false,
    placeholder,
    className = "",
    style,
    ...restProps // 接收其他原生input属性
  } = props;

  // 状态管理：内部值、中文输入法状态
  const [internalValue, setInternalValue] = useState<string>(defaultValue);
  const [isComposing] = useState<boolean>(false); // 处理中文输入法

  // 判断是否为受控模式
  const isControlled = propsValue !== undefined;
  // 显示的值：受控模式用propsValue，非受控模式用internalValue
  const displayedValue = isControlled ? propsValue : internalValue;

  // 输入框DOM引用
  const inputRef = useRef<HTMLInputElement>(null);

  // 暴露方法给父组件（通过ref）
  useImperativeHandle(ref, () => ({
    // 获取输入框DOM元素
    getInput: () => inputRef.current,
    // 手动聚焦
    focus: () => {
      inputRef.current?.focus();
    },
    // 手动失焦
    blur: () => {
      inputRef.current?.blur();
    },
  }));

  // 处理输入内容变化
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    // 非受控模式下，更新内部状态
    if (!isControlled) {
      setInternalValue(newValue);
    }
    // 若非中文输入组合阶段，则调用外部onChange
    if (!isComposing && onChange) {
      onChange(newValue, e);
    }
  };

  // 处理键盘事件
  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // 按下回车时触发onPressEnter
    if (e.key === "Enter" && onPressEnter) {
      onPressEnter(e);
    }
    // 调用可能通过props传递的onKeyDown
    if (restProps.onKeyDown) {
      restProps.onKeyDown(e);
    }
  };

  // 清除输入内容
  const handleClear = (e: MouseEvent<HTMLSpanElement>) => {
    e.stopPropagation(); // 阻止事件冒泡
    // 非受控模式下，清空内部状态
    if (!isControlled) {
      setInternalValue("");
    }
    // 手动触发一个change事件，模拟清空操作
    const mockEvent = {
      ...e,
      target: {
        ...e.target,
        value: "",
      },
    } as unknown as ChangeEvent<HTMLInputElement>;

    if (onChange) {
      onChange("", mockEvent);
    }
    // 调用专门的onClear回调
    if (onClear) {
      onClear();
    }
    // 清空后重新聚焦输入框
    inputRef.current?.focus();
  };

  // 组装最终的className
  const wrapperClassNames = [
    styles.inputWrapper,
    styles[`size-${size}`],
    disabled ? styles.disabled : "",
    loading ? styles.loading : "",
    prefix ? styles.withPrefix : "",
    suffix || (allowClear && displayedValue) ? styles.withSuffix : "",
    className, // 用户自定义的className
  ]
    .filter((cls) => cls)
    .join(" ");

  return (
    <div
      className={wrapperClassNames}
      style={style}
      onClick={() => !disabled && !loading && inputRef.current?.focus()} // 点击容器聚焦输入框
    >
      {/* 前缀图标或内容 */}
      {prefix && <span className={styles.prefix}>{prefix}</span>}

      {/* 输入框主体 */}
      <input
        {...restProps} // 展开其他原生属性（如type, maxLength, autoFocus等）
        ref={inputRef}
        className={styles.input}
        value={displayedValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled || loading}
      />

      {/* 后缀区域：清除按钮、加载图标、自定义后缀 */}
      <span className={styles.suffix}>
        {/* 清除按钮（有值、允许清除、非禁用、非加载时显示） */}
        {allowClear && displayedValue && !disabled && !loading && (
          <span className={styles.clearIcon} onClick={handleClear} role="button" aria-label="Clear input">
            ×
          </span>
        )}
        {/* 加载图标 */}
        {loading && <span className={styles.loadingIcon}>⏳</span>}
        {/* 自定义后缀内容 */}
        {suffix}
      </span>
    </div>
  );
});

// 为组件添加显示名，便于调试
Input.displayName = "Input";

export default Input;
