// src/drawer/hostMount.ts

import { mountDrawerController } from "./mountDrawerController";

import type {
  FixedAssetsDrawerOpenArgs,
  FixedAssetsDrawerResult,
} from "./FixedAssetsDrawer";

console.log("[PPE] hostMount module loaded");

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

  const root = document.getElementById("fs-react-drawer-root");

  if (!root) {
    console.error(
      "[PPE] Cannot mount Fixed Assets Drawer: #fs-react-drawer-root missing"
    );
    return;
  }

  // Keep the React drawer root outside any hidden static modal.
  const issueModal = document.getElementById("projectIssueModal");

  if (issueModal?.contains(root)) {
    console.log(
      "[PPE] Moving Fixed Assets Drawer root outside projectIssueModal"
    );

    document.body.appendChild(root);
  }

  // Do not create a second React root if one already exists.
  if (window.__fs_fixed_assets_drawer_mounted) {
    console.log("[PPE] already mounted");

    console.log(
      "[PPE] drawer root parent =",
      root.parentElement?.id || root.parentElement?.tagName
    );

    return;
  }

  try {
    mountDrawerController();

    // IMPORTANT: only mark mounted AFTER successful mount
    window.__fs_fixed_assets_drawer_mounted = true;

    console.log("[PPE] Fixed Assets Drawer mounted successfully");

    console.log(
      "[PPE] FS_OPEN_FIXED_ASSETS_DRAWER after mount =",
      typeof window.FS_OPEN_FIXED_ASSETS_DRAWER
    );
  } catch (err) {
    window.__fs_fixed_assets_drawer_mounted = false;

    console.error(
      "[PPE] Fixed Assets Drawer mount failed:",
      err
    );
  }
};

