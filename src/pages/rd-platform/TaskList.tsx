import { useRdList } from "@/hooks/useRdList";
import { useOrgMemberOptions } from "@/hooks/useOrgMemberOptions";
import React, { useState } from "react";
import { useRdNavigate } from "@/hooks/useRdNavigate";
import { formatDateTime } from "@/utils/utils";
import { encodeId } from "@/utils/hashId";
import {
  FaPlus,
  FaEye,
  FaEdit,
  FaTrash,
  FaFilter,
  FaTasks,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import styles from "./ListPage.module.css";
import taskStyles from "./TaskList.module.css";
import Input from "@/components/input/Input";
import DatePicker from "@/components/datePicker/DatePicker";
import CustomSelect from "@/components/customSelect/CustomSelect";
import Modal from "@/components/modal/Modal";
import Loading from "@/components/loading/Loading";
import { confirm } from "@/components/confirm/Confirm";
import message from "@/components/message/Message";
import { useAuth } from "@/contexts/AuthContext";
import { useRdOrg } from "@/contexts/RdOrgContext";
import { RdPlatformService as RdAPI } from "@/services/rdPlatformService";
import AssigneeDisplay from "@/components/assigneeDisplay/AssigneeDisplay";
import type { Task } from "@/types/rdPlatform";
import { OrgPermission } from "@/types/rdPlatform";
import type { SelectOption } from "../../types";

const statusOptions: SelectOption[] = [
  { id: "", name: "全部状态", color: "#6c757d" },
  { id: "todo", name: "待办", color: "#3b82f6" },
  { id: "doing", name: "进行中", color: "#eab308" },
  { id: "done", name: "已完成", color: "#22c55e" },
  { id: "closed", name: "已关闭", color: "#6b7280" },
];

const priorityOptions: SelectOption[] = [
  { id: "", name: "全部优先级", color: "#6c757d" },
  { id: "high", name: "高", color: "#ef4444" },
  { id: "medium", name: "中", color: "#f59e0b" },
  { id: "low", name: "低", color: "#22c55e" },
];

const statusText: Record<string, string> = { todo: "待办", doing: "进行中", done: "已完成", closed: "已关闭" };
const priorityText: Record<string, string> = { high: "高", medium: "中", low: "低" };

const PAGE_SIZE = 10;

const emptyTask = {
  title: "",
  description: "",
  status: "todo",
  priority: "medium",
  assignee: "",
  organizationId: "",
  requirementId: "",
  deadline: "",
  estimatedHours: 0,
};

const TaskList: React.FC = () => {
  const navigate = useRdNavigate();
  const { user } = useAuth();
  const { isAdmin, userOrgIds, orgs, maxOrgRole, selectedOrgId } = useRdOrg();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", status: "", priority: "", assignee: "" });

  // Modal state
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...emptyTask });
  const memberOptions = useOrgMemberOptions(modalVisible, form.organizationId);
  const {
    data: tasks,
    total,
    loading,
    refresh: fetchData,
  } = useRdList(RdAPI.getTasks, filters, currentPage, selectedOrgId, PAGE_SIZE);

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const getDefaultOrgId = (): string => {
    if (orgs.length === 1) return orgs[0].orgId;
    return "";
  };

  const openCreate = () => {
    setEditingTask(null);
    setForm({ ...emptyTask, organizationId: selectedOrgId || getDefaultOrgId() });
    setModalVisible(true);
  };

  const openEdit = (task: Task) => {
    setEditingTask(task);
    setForm({
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      assignee: task.assignee,
      organizationId: task.organizationId,
      requirementId: task.requirementId,
      deadline: task.deadline,
      estimatedHours: task.estimatedHours,
    });
    setModalVisible(true);
  };

  const handleFormChange = (field: string, value: string | number) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      message.warn("请输入任务标题");
      return;
    }
    if (!isAdmin && !form.organizationId) {
      message.warn("请选择所属组织");
      return;
    }

    const data = {
      title: form.title.trim(),
      description: form.description,
      status: form.status as Task["status"],
      priority: form.priority as Task["priority"],
      assignee: form.assignee,
      organizationId: form.organizationId || userOrgIds[0] || "",
      requirementId: form.requirementId,
      deadline: form.deadline,
      estimatedHours: Number(form.estimatedHours) || 0,
    };

    try {
      if (editingTask) {
        await RdAPI.updateTask(editingTask.id, data);
        message.success("任务更新成功");
      } else {
        await RdAPI.createTask({ ...data, creator: user?.name || user?.account || "未知" });
        message.success("任务创建成功");
      }
      setModalVisible(false);
      fetchData();
    } catch (err: any) {
      message.error(err?.message || "操作失败，请稍后重试");
    }
  };

  const handleDelete = async (task: Task) => {
    await confirm({
      title: "确认删除",
      content: (
        <div>
          确定要删除任务 "<strong>{task.title}</strong>" 吗？
        </div>
      ),
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await RdAPI.deleteTask(task.id, task.organizationId);
          message.success("任务已删除");
          fetchData();
        } catch (err: any) {
          message.error(err?.message || "删除失败");
        }
      },
    });
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const start = Math.max(1, currentPage - 2);
      const end = Math.min(totalPages, start + 4);
      if (start > 1) {
        pages.push(1);
        if (start > 2) pages.push("...");
      }
      for (let i = start; i <= end; i++) pages.push(i);
      if (end < totalPages) {
        if (end < totalPages - 1) pages.push("...");
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (loading && tasks.length === 0) return <Loading />;

  return (
    <div className={styles.listPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>任务管理</h1>
          <p className={styles.pageDescription}>管理开发任务，跟踪执行进度</p>
        </div>
        {OrgPermission.canCreateTask(maxOrgRole) && (
          <button className={styles.createBtn} onClick={openCreate}>
            <FaPlus /> 新建任务
          </button>
        )}
      </div>

      <div className={styles.filterSection}>
        <div className={styles.filterHeader}>
          <h3 className={styles.filterTitle}>
            <FaFilter /> 筛选条件
          </h3>
          <button
            className={styles.clearBtn}
            onClick={() => {
              setFilters({ search: "", status: "", priority: "", assignee: "" });
              setCurrentPage(1);
            }}
          >
            清除筛选
          </button>
        </div>
        <div className={styles.filterForm}>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>搜索</label>
            <Input
              placeholder="标题或描述"
              value={filters.search}
              onChange={(val) => handleFilterChange("search", val)}
              allowClear
              size="large"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>负责人</label>
            <Input
              placeholder="搜索负责人"
              value={filters.assignee}
              onChange={(val) => handleFilterChange("assignee", val)}
              allowClear
              size="large"
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>状态</label>
            <CustomSelect
              name="状态"
              options={statusOptions}
              value={statusOptions.find((o) => o.id === filters.status) || null}
              onChange={(o) => handleFilterChange("status", (o?.id as string) || "")}
              hideBadge
            />
          </div>
          <div className={styles.filterGroup}>
            <label className={styles.filterLabel}>优先级</label>
            <CustomSelect
              name="优先级"
              options={priorityOptions}
              value={priorityOptions.find((o) => o.id === filters.priority) || null}
              onChange={(o) => handleFilterChange("priority", (o?.id as string) || "")}
              hideBadge
            />
          </div>
        </div>
      </div>

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>标题</th>
              <th>状态</th>
              <th>优先级</th>
              <th>负责人</th>
              <th>截止日期</th>
              <th>预估工时</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id}>
                <td className={styles.titleCell} data-label="标题" onClick={() => navigate(`/rd/tasks/${encodeId(t.id, "task")}`)}>
                  {t.title}
                </td>
                <td data-label="状态">
                  <span className={`${styles.badge} ${styles[`status_${t.status}`]}`}>{statusText[t.status]}</span>
                </td>
                <td data-label="优先级">
                  <span className={`${styles.badge} ${styles[`priority_${t.priority}`]}`}>{priorityText[t.priority]}</span>
                </td>
                <td data-label="负责人">
                  <AssigneeDisplay name={t.assignee} avatar={t.assigneeAvatar} />
                </td>
                <td data-label="截止日期">{t.deadline ? formatDateTime(t.deadline) : "-"}</td>
                <td data-label="预估工时">{t.estimatedHours ? `${t.estimatedHours}h` : "-"}</td>
                <td data-label="操作">
                  <div className={styles.actionButtons}>
                    <button
                      className={`${styles.actionBtn} ${styles.view}`}
                      title="查看"
                      onClick={() => navigate(`/rd/tasks/${encodeId(t.id, "task")}`)}
                    >
                      <FaEye />
                    </button>
                    {OrgPermission.canEdit(maxOrgRole) && (
                      <button className={`${styles.actionBtn} ${styles.edit}`} title="编辑" onClick={() => openEdit(t)}>
                        <FaEdit />
                      </button>
                    )}
                    {OrgPermission.canDelete(maxOrgRole) && (
                      <button className={`${styles.actionBtn} ${styles.delete}`} title="删除" onClick={() => handleDelete(t)}>
                        <FaTrash />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} className={styles.emptyCell}>
                  <div className={styles.emptyCellIcon}>
                    <FaTasks />
                  </div>
                  <div className={styles.emptyCellText}>暂无任务数据</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {
        <div className={styles.pagination}>
          <span className={styles.paginationInfo}>共 {total} 条记录</span>
          <div className={styles.paginationControls}>
            <button disabled={currentPage === 1} onClick={() => setCurrentPage(1)}>
              <FaAngleDoubleLeft />
            </button>
            <button disabled={currentPage === 1} onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}>
              <FaChevronLeft />
            </button>
            {getPageNumbers().map((page, i) =>
              page === "..." ? (
                <span key={`dot-${i}`} className={styles.paginationEllipsis}>
                  ...
                </span>
              ) : (
                <button
                  key={page}
                  className={currentPage === page ? styles.activePage : ""}
                  onClick={() => setCurrentPage(page as number)}
                >
                  {page}
                </button>
              ),
            )}
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}>
              <FaChevronRight />
            </button>
            <button disabled={currentPage === totalPages} onClick={() => setCurrentPage(totalPages)}>
              <FaAngleDoubleRight />
            </button>
          </div>
        </div>
      }

      {/* Create/Edit Modal */}
      <Modal
        visible={modalVisible}
        title={editingTask ? "编辑任务" : "新建任务"}
        onClose={() => setModalVisible(false)}
        width={640}
        footer={
          <div className={taskStyles.modalFooter}>
            <button onClick={() => setModalVisible(false)} className={taskStyles.modalCancelBtn}>
              取消
            </button>
            <button onClick={handleSubmit} className={taskStyles.modalSubmitBtn}>
              {editingTask ? "保存修改" : "创建任务"}
            </button>
          </div>
        }
      >
        <div className={taskStyles.formContainer}>
          <div>
            <label className={taskStyles.formLabel}>
              标题 <span className={taskStyles.formLabelRequired}>*</span>
            </label>
            <Input placeholder="请输入任务标题" value={form.title} onChange={(val) => handleFormChange("title", val)} size="large" />
          </div>

          {(isAdmin || orgs.length > 1) && (
            <div>
              <label className={taskStyles.formLabel}>
                所属组织 {!isAdmin && <span className={taskStyles.formLabelRequired}>*</span>}
              </label>
              <CustomSelect
                name="所属组织"
                options={orgs.map((o) => ({ id: o.orgId, name: o.orgName, color: "#6c757d" }))}
                value={
                  orgs.find((o) => o.orgId === form.organizationId)
                    ? { id: form.organizationId, name: orgs.find((o) => o.orgId === form.organizationId)!.orgName, color: "#6c757d" }
                    : null
                }
                onChange={(o) => handleFormChange("organizationId", (o?.id as string) || "")}
                hideBadge
                disabled={!!editingTask || !!selectedOrgId}
              />
            </div>
          )}

          <div className={taskStyles.formRow}>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>状态</label>
              <CustomSelect
                name="状态"
                options={statusOptions.filter((o) => o.id !== "")}
                value={statusOptions.find((o) => o.id === form.status) || null}
                onChange={(o) => handleFormChange("status", (o?.id as string) || "todo")}
                hideBadge
              />
            </div>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>优先级</label>
              <CustomSelect
                name="优先级"
                options={priorityOptions.filter((o) => o.id !== "")}
                value={priorityOptions.find((o) => o.id === form.priority) || null}
                onChange={(o) => handleFormChange("priority", (o?.id as string) || "medium")}
                hideBadge
              />
            </div>
          </div>

          <div className={taskStyles.formRow}>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>负责人</label>
              <CustomSelect
                name="负责人"
                options={memberOptions}
                value={
                  memberOptions.find((o) => o.id === form.assignee) ||
                  (form.assignee ? { id: form.assignee, name: form.assignee, color: "#6c757d" } : null)
                }
                onChange={(o) => handleFormChange("assignee", (o?.id as string) || "")}
                hideBadge
              />
            </div>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>截止日期</label>
              <DatePicker
                placeholder="请选择截止日期"
                value={form.deadline ? new Date(form.deadline) : undefined}
                onChange={(date) => {
                  const str = date
                    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
                    : "";
                  handleFormChange("deadline", str);
                }}
                size="large"
                allowClear
              />
            </div>
          </div>

          <div className={taskStyles.formRow}>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>预估工时 (h)</label>
              <Input
                placeholder="如 8"
                value={String(form.estimatedHours || "")}
                onChange={(val) => handleFormChange("estimatedHours", Number(val) || 0)}
                type="number"
                size="large"
              />
            </div>
            <div className={taskStyles.formField}>
              <label className={taskStyles.formLabel}>关联需求 ID</label>
              <Input
                placeholder="选填"
                value={form.requirementId}
                onChange={(val) => handleFormChange("requirementId", val)}
                size="large"
              />
            </div>
          </div>

          <div>
            <label className={taskStyles.formLabel}>描述</label>
            <textarea
              placeholder="请输入任务描述"
              value={form.description}
              onChange={(e) => handleFormChange("description", e.target.value)}
              rows={4}
              className={taskStyles.formTextarea}
            />
          </div>
        </div>
      </Modal>
    </div>
  );
};

export default TaskList;
