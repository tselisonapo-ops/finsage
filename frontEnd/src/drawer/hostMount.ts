// src/drawer/hostMount.ts
import { mountDrawerController } from "./mountDrawerController";

declare global {
  interface Window {
    FS_MOUNT_FIXED_ASSETS_DRAWER?: () => void;
    __fs_fixed_assets_drawer_mounted?: boolean;
  }
}

window.FS_MOUNT_FIXED_ASSETS_DRAWER = () => {
  if (window.__fs_fixed_assets_drawer_mounted) return;
  window.__fs_fixed_assets_drawer_mounted = true;
  mountDrawerController();
};
