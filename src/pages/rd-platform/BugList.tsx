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
  FaBug,
  FaAngleDoubleLeft,
  FaAngleDoubleRight,
  FaChevronLeft,
  FaChevronRight,
} from "react-icons/fa";
import styles from "./ListPage.module.css";
import bugStyles from "./BugList.module.css";
import Input from "@/components/input/Input";
import CustomSelect from "@/components/customSelect/CustomSelect";
import Modal from "@/components/modal/Modal";
import Loading from "@/components/loading/Loading";
import { confirm } from "@/components/confirm/Confirm";
import message from "@/components/message/Message";
import { useAuth } from "@/contexts/AuthContext";
import { useRdOrg } from "@/contexts/RdOrgContext";
import { RdPlatformService as RdAPI } from "@/services/rdPlatformService";
import AssigneeDisplay from "@/components/assigneeDisplay/AssigneeDisplay";
import type { SelectOption } from "../../types";
import type { Bug } from "@/types/rdPlatform";
import { OrgPermission } from "@/types/rdPlatform";

// ---- constants ----
const statusOptions: SelectOption[] = [
  { id: "", name: "全部状态", color: "#6c757d" },
  { id: "new", name: "新建", color: "#3b82f6" },
  { id: "processing", name: "处理中", color: "#a855f7" },
  { id: "verified", name: "已验证", color: "#22c55e" },
  { id: "closed", name: "已关闭", color: "#6b7280" },
  { id: "reopened", name: "已重开", color: "#ef4444" },
];

const severityOptions: SelectOption[] = [
  { id: "", name: "全部严重程度", color: "#6c757d" },
  { id: "fatal", name: "致命", color: "#dc2626" },
  { id: "serious", name: "严重", color: "#ea580c" },
  { id: "normal", name: "一般", color: "#f59e0b" },
  { id: "minor", name: "轻微", color: "#22c55e" },
];

const priorityOptions: SelectOption[] = [
  { id: "", name: "全部优先级", color: "#6c757d" },
  { id: "urgent", name: "紧急", color: "#dc2626" },
  { id: "high", name: "高", color: "#ef4444" },
  { id: "medium", name: "中", color: "#f59e0b" },
  { id: "low", name: "低", color: "#22c55e" },
];

const formSeverityOptions = severityOptions.filter((o) => o.id !== "");
const formPriorityOptions = priorityOptions.filter((o) => o.id !== "");
const formStatusOptions = statusOptions.filter((o) => o.id !== "");

const statusText: Record<string, string> = {
  new: "新建",
  processing: "处理中",
  verified: "已验证",
  closed: "已关闭",
  reopened: "已重开",
};
const severityText: Record<string, string> = { fatal: "致命", serious: "严重", normal: "一般", minor: "轻微" };
const priorityText: Record<string, string> = { urgent: "紧急", high: "高", medium: "中", low: "低" };
const PAGE_SIZE = 10;

interface FormData {
  title: string;
  description: string;
  severity: string;
  priority: string;
  status: string;
  assignee: string;
  organizationId: string;
  relatedRequirementId: string;
  module: string;
  stepsToReproduce: string;
  environment: string;
}

const emptyForm: FormData = {
  title: "",
  description: "",
  severity: "normal",
  priority: "high",
  status: "new",
  assignee: "",
  organizationId: "",
  relatedRequirementId: "",
  module: "",
  stepsToReproduce: "",
  environment: "",
};

// ---- component ----
const BugList: React.FC = () => {
  const navigate = useRdNavigate();
  const { user } = useAuth();
  const { isAdmin, userOrgIds, orgs, orgNameMap, maxOrgRole, selectedOrgId } = useRdOrg();
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({ search: "", status: "", severity: "", priority: "" });

  // modal
  const [modalVisible, setModalVisible] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "view" | "edit">("create");
  const [selectedBug, setSelectedBug] = useState<Bug | null>(null);
  const [form, setForm] = useState<FormData>({ ...emptyForm });
  const memberOptions = useOrgMemberOptions(modalVisible, form.organizationId);
  const { data: bugs, total, loading, refresh: fetchData } = useRdList(RdAPI.getBugs, filters, currentPage, selectedOrgId, PAGE_SIZE);

  const handleFilterChange = (field: string, value: string) => {
    setFilters((prev) => ({ ...prev, [field]: value }));
    setCurrentPage(1);
  };

  const getDefaultOrgId = (): string => {
    if (orgs.length === 1) return orgs[0].orgId;
    return "";
  };

  // ---- modal handlers ----
  const openCreate = () => {
    setModalMode("create");
    setSelectedBug(null);
    setForm({ ...emptyForm, organizationId: selectedOrgId || getDefaultOrgId() });
    setModalVisible(true);
  };
  const openEdit = (bug: Bug) => {
    setModalMode("edit");
    setSelectedBug(bug);
    setForm({
      title: bug.title,
      description: bug.description,
      severity: bug.severity,
      priority: bug.priority,
      status: bug.status,
      assignee: bug.assignee,
      organizationId: bug.organizationId,
      relatedRequirementId: bug.relatedRequirementId,
      module: bug.module,
      stepsToReproduce: bug.stepsToReproduce,
      environment: bug.environment,
    });
    setModalVisible(true);
  };
  const closeModal = () => {
    setModalVisible(false);
    setSelectedBug(null);
  };
  const setFormField = (field: keyof FormData, value: string) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      message.warn("请输入缺陷标题");
      return;
    }
    if (!isAdmin && !form.organizationId) {
      message.warn("请选择所属组织");
      return;
    }
    const data = {
      title: form.title.trim(),
      description: form.description,
      severity: form.severity as Bug["severity"],
      priority: form.priority as Bug["priority"],
      status: form.status as Bug["status"],
      assignee: form.assignee,
      organizationId: form.organizationId || userOrgIds[0] || "",
      relatedRequirementId: form.relatedRequirementId,
      module: form.module,
      stepsToReproduce: form.stepsToReproduce,
      environment: form.environment,
    };
    try {
      if (modalMode === "edit" && selectedBug) {
        await RdAPI.updateBug(selectedBug.id, data);
        message.success("缺陷更新成功");
      } else {
        await RdAPI.createBug({ ...data, status: "new", creator: user?.name || user?.account || "未知" });
        message.success("缺陷提交成功");
      }
      closeModal();
      fetchData();
    } catch (err: any) {
      message.error(err?.message || "操作失败，请稍后重试");
    }
  };

  const handleDelete = async (bug: Bug) => {
    await confirm({
      title: "确认删除",
      content: (
        <div>
          确定要删除缺陷 "<strong>{bug.title}</strong>" 吗？删除后无法恢复。
        </div>
      ),
      confirmText: "删除",
      cancelText: "取消",
      onConfirm: async () => {
        try {
          await RdAPI.deleteBug(bug.id, bug.organizationId);
          message.success("缺陷已删除");
          fetchData();
        } catch (err: any) {
          message.error(err?.message || "删除失败");
        }
      },
    });
  };

  const renderField = (label: string, value: React.ReactNode) => (
    <div className={bugStyles.detailField}>
      <span className={bugStyles.detailFieldLabel}>{label}</span>
      <span className={bugStyles.detailFieldValue}>{value || "-"}</span>
    </div>
  );

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const getPageNumbers = (): (number | string)[] => {
    const pages: (number | string)[] = [];
    if (totalPages <= 5) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      const s = Math.max(1, currentPage - 2),
        e = Math.min(totalPages, s + 4);
      if (s > 1) {
        pages.push(1);
        if (s > 2) pages.push("...");
      }
      for (let i = s; i <= e; i++) pages.push(i);
      if (e < totalPages) {
        if (e < totalPages - 1) pages.push("...");
        pages.push(totalPages);
      }
    }
    return pages;
  };

  if (loading && bugs.length === 0) return <Loading />;

  return (
    <div className={styles.listPage}>
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>缺陷管理</h1>
          <p className={styles.pageDescription}>管理项目缺陷，跟踪修复进度</p>
        </div>
        {OrgPermission.canCreate(maxOrgRole) && (
          <button className={styles.createBtn} onClick={openCreate}>
            <FaPlus /> 提交缺陷
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
              setFilters({ search: "", status: "", severity: "", priority: "" });
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
              placeholder="标题、描述或创建人"
              value={filters.search}
              onChange={(val) => handleFilterChange("search", val)}
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
            <label className={styles.filterLabel}>严重程度</label>
            <CustomSelect
              name="严重程度"
              options={severityOptions}
              value={severityOptions.find((o) => o.id === filters.severity) || null}
              onChange={(o) => handleFilterChange("severity", (o?.id as string) || "")}
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
              <th>严重程度</th>
              <th>优先级</th>
              <th>状态</th>
              <th>负责人</th>
              <th>模块</th>
              <th>创建人</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {bugs.map((b) => (
              <tr key={b.id}>
                <td className={styles.titleCell} data-label="标题" onClick={() => navigate(`/rd/bugs/${encodeId(b.id, "bug")}`)}>
                  {b.title}
                </td>
                <td data-label="严重程度">
                  <span className={`${styles.badge} ${styles[`severity_${b.severity}`]}`}>{severityText[b.severity]}</span>
                </td>
                <td data-label="优先级">
                  <span className={`${styles.badge} ${styles[`priority_${b.priority}`]}`}>{priorityText[b.priority]}</span>
                </td>
                <td data-label="状态">
                  <span className={`${styles.badge} ${styles[`status_${b.status}`]}`}>{statusText[b.status]}</span>
                </td>
                <td data-label="负责人">
                  <AssigneeDisplay name={b.assignee} avatar={b.assigneeAvatar} />
                </td>
                <td data-label="模块">{b.module || "-"}</td>
                <td data-label="创建人">{b.creator}</td>
                <td data-label="创建时间">{formatDateTime(b.createdAt)}</td>
                <td data-label="操作">
                  <div className={styles.actionButtons}>
                    <button
                      className={`${styles.actionBtn} ${styles.view}`}
                      title="查看"
                      onClick={() => navigate(`/rd/bugs/${encodeId(b.id, "bug")}`)}
                    >
                      <FaEye />
                    </button>
                    {OrgPermission.canEdit(maxOrgRole) && (
                      <button className={`${styles.actionBtn} ${styles.edit}`} title="编辑" onClick={() => openEdit(b)}>
                        <FaEdit />
                      </button>
                    )}
                    {OrgPermission.canDelete(maxOrgRole) && (
                      <button className={`${styles.actionBtn} ${styles.delete}`} title="删除" onClick={() => handleDelete(b)}>
                        <FaTrash />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {bugs.length === 0 && (
              <tr>
                <td colSpan={9} className={styles.emptyCell}>
                  <div className={styles.emptyCellIcon}>
                    <FaBug />
                  </div>
                  <div className={styles.emptyCellText}>暂无缺陷数据</div>
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
                <span key={`d-${i}`} className={styles.paginationEllipsis}>
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

      {/* ============ MODAL ============ */}
      <Modal
        visible={modalVisible}
        title={modalMode === "create" ? "提交缺陷" : modalMode === "edit" ? "编辑缺陷" : selectedBug?.title || "缺陷详情"}
        onClose={closeModal}
        width={760}
        footer={
          modalMode === "view" ? null : (
            <div className={bugStyles.modalFooter}>
              <button onClick={closeModal} className={bugStyles.modalCancelBtn}>
                取消
              </button>
              <button onClick={handleSubmit} className={bugStyles.modalSubmitBtn}>
                {modalMode === "edit" ? "保存修改" : "提交缺陷"}
              </button>
            </div>
          )
        }
      >
        {modalMode === "view" && selectedBug ? (
          /* ---- detail view ---- */
          <div data-allow-copy="true">
            <div className={bugStyles.detailBadges}>
              <span className={`${styles.badge} ${styles[`severity_${selectedBug.severity}`]}`}>
                {severityText[selectedBug.severity]}
              </span>
              <span className={`${styles.badge} ${styles[`priority_${selectedBug.priority}`]}`}>
                {priorityText[selectedBug.priority]}
              </span>
              <span className={`${styles.badge} ${styles[`status_${selectedBug.status}`]}`}>{statusText[selectedBug.status]}</span>
            </div>
            <div className={bugStyles.detailGrid}>
              {renderField("负责人", <AssigneeDisplay name={selectedBug.assignee} avatar={selectedBug.assigneeAvatar} />)}
              {renderField("创建人", selectedBug.creator)}
              {renderField("所属组织", orgNameMap[selectedBug.organizationId] || selectedBug.organizationId)}
              {renderField("所属模块", selectedBug.module)}
              {renderField("关联需求", selectedBug.relatedRequirementId)}
              {renderField("运行环境", selectedBug.environment)}
              {renderField("创建时间", formatDateTime(selectedBug.createdAt))}
              {renderField("更新时间", formatDateTime(selectedBug.updatedAt))}
            </div>
            <div className={selectedBug.stepsToReproduce ? bugStyles.detailSection : bugStyles.detailSectionLast}>
              <h4 className={bugStyles.detailSectionTitle}>描述</h4>
              <div className={bugStyles.detailDescription}>{selectedBug.description || "暂无描述"}</div>
            </div>
            {selectedBug.stepsToReproduce && (
              <div>
                <h4 className={bugStyles.detailSectionTitle}>复现步骤</h4>
                <div className={bugStyles.detailDescription}>{selectedBug.stepsToReproduce}</div>
              </div>
            )}
          </div>
        ) : (
          /* ---- create / edit form ---- */
          <div className={bugStyles.formContainer}>
            <div>
              <label className={bugStyles.formLabel}>
                标题 <span className={bugStyles.formLabelRequired}>*</span>
              </label>
              <Input placeholder="请输入缺陷标题" value={form.title} onChange={(v) => setFormField("title", v)} size="large" />
            </div>
            {(isAdmin || orgs.length > 1) && (
              <div>
                <label className={bugStyles.formLabel}>
                  所属组织 {!isAdmin && <span className={bugStyles.formLabelRequired}>*</span>}
                </label>
                <CustomSelect
                  name="所属组织"
                  options={orgs.map((o) => ({ id: o.orgId, name: o.orgName, color: "#6c757d" }))}
                  value={
                    orgs.find((o) => o.orgId === form.organizationId)
                      ? {
                          id: form.organizationId,
                          name: orgs.find((o) => o.orgId === form.organizationId)!.orgName,
                          color: "#6c757d",
                        }
                      : null
                  }
                  onChange={(o) => setFormField("organizationId", (o?.id as string) || "")}
                  hideBadge
                  disabled={modalMode === "edit" || !!selectedOrgId}
                />
              </div>
            )}
            <div className={bugStyles.formRow}>
              <div className={bugStyles.formField}>
                <label className={bugStyles.formLabel}>严重程度</label>
                <CustomSelect
                  name="严重程度"
                  options={formSeverityOptions}
                  value={formSeverityOptions.find((o) => o.id === form.severity) || null}
                  onChange={(o) => setFormField("severity", (o?.id as string) || "normal")}
                  hideBadge
                />
              </div>
              <div className={bugStyles.formField}>
                <label className={bugStyles.formLabel}>优先级</label>
                <CustomSelect
                  name="优先级"
                  options={formPriorityOptions}
                  value={formPriorityOptions.find((o) => o.id === form.priority) || null}
                  onChange={(o) => setFormField("priority", (o?.id as string) || "high")}
                  hideBadge
                />
              </div>
              {modalMode === "edit" && (
                <div className={bugStyles.formField}>
                  <label className={bugStyles.formLabel}>状态</label>
                  <CustomSelect
                    name="状态"
                    options={formStatusOptions}
                    value={formStatusOptions.find((o) => o.id === form.status) || null}
                    onChange={(o) => setFormField("status", (o?.id as string) || "new")}
                    hideBadge
                  />
                </div>
              )}
            </div>
            <div className={bugStyles.formRow}>
              <div className={bugStyles.formField}>
                <label className={bugStyles.formLabel}>负责人</label>
                <CustomSelect
                  name="负责人"
                  options={memberOptions}
                  value={
                    memberOptions.find((o) => o.id === form.assignee) ||
                    (form.assignee ? { id: form.assignee, name: form.assignee, color: "#6c757d" } : null)
                  }
                  onChange={(o) => setFormField("assignee", (o?.id as string) || "")}
                  hideBadge
                />
              </div>
              <div className={bugStyles.formField}>
                <label className={bugStyles.formLabel}>关联需求 ID</label>
                <Input
                  placeholder="选填"
                  value={form.relatedRequirementId}
                  onChange={(v) => setFormField("relatedRequirementId", v)}
                  size="large"
                />
              </div>
              <div className={bugStyles.formField}>
                <label className={bugStyles.formLabel}>所属模块</label>
                <Input placeholder="如 用户模块" value={form.module} onChange={(v) => setFormField("module", v)} size="large" />
              </div>
            </div>
            <div>
              <label className={bugStyles.formLabel}>描述</label>
              <textarea
                placeholder="请输入缺陷详细描述..."
                value={form.description}
                onChange={(e) => setFormField("description", e.target.value)}
                rows={5}
                className={bugStyles.formTextarea}
              />
            </div>
            <div>
              <label className={bugStyles.formLabel}>复现步骤</label>
              <textarea
                placeholder={"1. 打开页面\n2. 点击按钮\n3. 观察结果"}
                value={form.stepsToReproduce}
                onChange={(e) => setFormField("stepsToReproduce", e.target.value)}
                rows={4}
                className={bugStyles.formTextarea}
              />
            </div>
            <div>
              <label className={bugStyles.formLabel}>运行环境</label>
              <Input
                placeholder="如 Chrome 120 / iOS 18 Safari"
                value={form.environment}
                onChange={(v) => setFormField("environment", v)}
                size="large"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default BugList;
