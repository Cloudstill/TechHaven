import Input from "../components/input/Input";
import { useState } from "react";
import { FaSearch, FaUser } from "react-icons/fa";

function SampleInput() {
  const [value, setValue] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSearch = () => {
    setIsLoading(true);
    // 模拟异步操作
    setTimeout(() => setIsLoading(false), 2000);
    // console.log('搜索:', searchText);
  };

  return (
    <>
      <div style={{ padding: "20px", maxWidth: "400px" }}>
        <h2>输入框示例</h2>
        {/* 基础用法 */}
        <Input
          placeholder="请输入内容"
          value={value}
          onChange={(value) => setValue(value)}
          allowClear
          style={{ marginBottom: "16px" }}
        />

        {/* 带前后缀和回车事件的搜索框 */}
        <Input
          placeholder="搜索..."
          value={searchText}
          onChange={(val) => setSearchText(val)}
          onPressEnter={handleSearch}
          prefix={<FaSearch />}
          allowClear
          loading={isLoading}
          size="large"
          style={{ marginBottom: "16px" }}
        />

        {/* 禁用状态 */}
        <Input placeholder="禁用输入" value="无法修改的内容" disabled prefix={<FaUser />} style={{ marginBottom: "16px" }} />

        {/* 不同尺寸 */}
        <Input placeholder="小尺寸" size="small" style={{ marginRight: "8px", width: "120px" }} />
        <Input placeholder="默认尺寸" style={{ marginRight: "8px", width: "150px" }} />
        <Input placeholder="大尺寸" size="large" style={{ width: "180px" }} />
      </div>
    </>
  );
}

export default SampleInput;
