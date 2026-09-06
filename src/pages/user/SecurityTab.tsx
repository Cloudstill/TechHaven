import React, { useState, useEffect, useCallback } from "react";
import { FaShieldAlt, FaDesktop, FaMobileAlt, FaSignOutAlt } from "react-icons/fa";
import styles from "./UserPage.module.css";
import secStyles from "./AccountSecurity.module.css";
import Switch from "@/components/switch/Switch";
import message from "@/components/message/Message";
import { confirm } from "@/components/confirm/Confirm";
import Loading from "@/components/loading/Loading";
import ErrorState from "@/components/errorState/ErrorState";
import DeviceService, { type LoginDevice } from "@/services/deviceService";
import { formatRelativeTime } from "@/utils/utils";

const isMobilePlatform = (platform: string): boolean => /ios|android|mobile/i.test(platform || "");

const SecurityTab: React.FC = () => {
  const [twoFactor, setTwoFactor] = useState(false);
  const [loginAlert, setLoginAlert] = useState(true);
  const [devices, setDevices] = useState<LoginDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [devicesError, setDevicesError] = useState<string | null>(null);
  const [kickingId, setKickingId] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setDevicesLoading(true);
    setDevicesError(null);
    try {
      const res = await DeviceService.listDevices();
      if (res.errno === 0 && Array.isArray(res.data?.list)) {
        setDevices(res.data.list);
      } else {
        setDevicesError("设备列表获取失败");
      }
    } catch (error: any) {
      setDevicesError(error.msg || error.message || "设备列表获取失败");
    } finally {
      setDevicesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const revoke = (d: LoginDevice) => {
    confirm({
      title: "下线设备",
      content: (
        <div>
          确定要将 "<strong>{d.device_name || d.platform || "未知设备"}</strong>" 强制下线吗？
        </div>
      ),
      confirmText: "下线",
      cancelText: "取消",
      onConfirm: async () => {
        setKickingId(d.device_id);
        try {
          await DeviceService.kickDevice(d.device_id);
          message.success("设备已下线");
          await loadDevices();
        } catch (error: any) {
          message.error(error.msg || error.message || "设备下线失败");
          await loadDevices();
        } finally {
          setKickingId(null);
        }
      },
    });
  };

  return (
    <div className={styles.tabWrap}>
      {import.meta.env.DEV && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>
            <FaShieldAlt /> 安全选项
          </h2>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <p className={styles.settingName}>两步验证（2FA）</p>
              <p className={styles.settingHint}>登录时需额外输入动态验证码，大幅提升账户安全</p>
            </div>
            <Switch
              checked={twoFactor}
              onChange={(c) => {
                setTwoFactor(c);
                message.info(c ? "已开启两步验证（演示）" : "已关闭两步验证");
              }}
            />
          </div>
          <div className={styles.settingRow}>
            <div className={styles.settingInfo}>
              <p className={styles.settingName}>异地登录提醒</p>
              <p className={styles.settingHint}>检测到新设备或异地登录时通过站内信提醒</p>
            </div>
            <Switch checked={loginAlert} onChange={(c) => setLoginAlert(c)} />
          </div>
        </div>
      )}

      <div className={styles.card}>
        <h2 className={styles.cardTitle}>
          <FaDesktop /> 登录设备
        </h2>
        <p className={styles.cardDesc}>当前共有 {devices.length} 台设备登录</p>
        {devicesLoading ? (
          <Loading size="medium" text="正在加载设备列表..." />
        ) : devicesError ? (
          <ErrorState title="设备列表加载失败" message={devicesError} actionText="重新加载" onAction={loadDevices} />
        ) : devices.length === 0 ? (
          <p className={styles.cardDesc}>暂无其他设备登录</p>
        ) : (
          <div className={secStyles.deviceList}>
            {devices.map((d) => {
              const isCurrent = !!d.is_current;
              const isKicking = kickingId === d.device_id;
              return (
                <div key={d.device_id} className={secStyles.deviceItem}>
                  <div className={secStyles.deviceIcon}>{isMobilePlatform(d.platform) ? <FaMobileAlt /> : <FaDesktop />}</div>
                  <div className={secStyles.deviceInfo}>
                    <p className={secStyles.deviceName}>
                      {d.device_name || d.platform || "未知设备"}
                      {isCurrent && <span className={secStyles.currentTag}>当前设备</span>}
                    </p>
                    <p className={secStyles.deviceMeta}>{[d.platform, d.ip ? `IP ${d.ip}` : ""].filter(Boolean).join(" · ")}</p>
                    <p className={secStyles.deviceMeta}>
                      登录于 {formatRelativeTime(d.login_time)} · 最近活跃 {formatRelativeTime(d.last_active_time)}
                    </p>
                  </div>
                  {!isCurrent && (
                    <button className={secStyles.revokeBtn} disabled={isKicking} onClick={() => revoke(d)}>
                      <FaSignOutAlt /> {isKicking ? "下线中..." : "下线"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SecurityTab;
