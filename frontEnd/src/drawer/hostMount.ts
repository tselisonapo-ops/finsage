// src/drawer/hostMount.ts
import { mountDrawerController } from "./mountDrawerController";
import type {
  FixedAssetsDrawerOpenArgs,
  FixedAssetsDrawerResult,
} from "./FixedAssetsDrawer";

declare global {
  interface Window {
    FS_MOUNT_FIXED_ASSETS_DRAWER?: () => void;
    __fs_fixed_assets_drawer_mounted?: boolean;
    FS_OPEN_FIXED_ASSETS_DRAWER?: (
      args: FixedAssetsDrawerOpenArgs
    ) => Promise<FixedAssetsDrawerResult>;
    FS_CLOSE_FIXED_ASSETS_DRAWER?: () => void;
  }
}

window.FS_MOUNT_FIXED_ASSETS_DRAWER = () => {
  console.log("[PPE] FS_MOUNT_FIXED_ASSETS_DRAWER called");

  if (window.__fs_fixed_assets_drawer_mounted) {
    console.log("[PPE] already mounted");
    return;
  }

  window.__fs_fixed_assets_drawer_mounted = true;
  mountDrawerController();

  console.log(
    "[PPE] FS_OPEN_FIXED_ASSETS_DRAWER after mount =",
    typeof window.FS_OPEN_FIXED_ASSETS_DRAWER
  );
};