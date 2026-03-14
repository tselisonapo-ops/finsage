import ReactDOM from "react-dom/client";
import DrawerController from "./drawerController";
import type {
  FixedAssetsDrawerOpenArgs,
  FixedAssetsDrawerResult,
} from "./FixedAssetsDrawer";

declare global {
  interface Window {
    FS_OPEN_FIXED_ASSETS_DRAWER?: (
      args: FixedAssetsDrawerOpenArgs
    ) => Promise<FixedAssetsDrawerResult>;
    FS_CLOSE_FIXED_ASSETS_DRAWER?: () => void;
    __fs_drawer_root__?: ReactDOM.Root;
  }
}

export function mountDrawerController() {
  const el = document.getElementById("fs-react-drawer-root");
  if (!el) throw new Error("Missing #fs-react-drawer-root");

  if (!window.__fs_drawer_root__) {
    const root = ReactDOM.createRoot(el);
    root.render(<DrawerController />);
    window.__fs_drawer_root__ = root;
  }

  window.FS_OPEN_FIXED_ASSETS_DRAWER = (
    args: FixedAssetsDrawerOpenArgs
  ) => {
    return new Promise<FixedAssetsDrawerResult>((resolve) => {
      window.dispatchEvent(
        new CustomEvent("fs:open-fixed-assets-drawer", {
          detail: { args, resolve },
        })
      );
    });
  };

  window.FS_CLOSE_FIXED_ASSETS_DRAWER = () => {
    window.dispatchEvent(new CustomEvent("fs:close-fixed-assets-drawer"));
  };

  return window.__fs_drawer_root__;
}