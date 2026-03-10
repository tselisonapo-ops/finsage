import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import FixedAssetsDrawer from "./FixedAssetsDrawer";
import type { FixedAssetsDrawerOpenArgs, FixedAssetsDrawerResult } from "./FixedAssetsDrawer";

declare global {
  interface Window {
    FS_OPEN_FIXED_ASSETS_DRAWER?: (args: FixedAssetsDrawerOpenArgs) => Promise<FixedAssetsDrawerResult>;
  }
}

export default function DrawerController() {
  const [open, setOpen] = useState(false);
  const [args, setArgs] = useState<FixedAssetsDrawerOpenArgs | null>(null);

  const resolverRef = useRef<((res: FixedAssetsDrawerResult) => void) | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setArgs(null);
    resolverRef.current = null;
  }, []);

  const onResolve = useCallback((res: FixedAssetsDrawerResult) => {
    resolverRef.current?.(res);
  }, []);

  useEffect(() => {
    window.FS_OPEN_FIXED_ASSETS_DRAWER = (newArgs: FixedAssetsDrawerOpenArgs) => {
      setArgs(newArgs);
      setOpen(true);

      return new Promise<FixedAssetsDrawerResult>((resolve) => {
        resolverRef.current = (res) => {
          resolve(res);
          close();
        };
      });
    };

    return () => {
      delete window.FS_OPEN_FIXED_ASSETS_DRAWER;
    };
  }, [close]);

  const safeArgs = useMemo(() => args, [args]);

  return (
    <FixedAssetsDrawer
      open={open}
      args={safeArgs}
      onClose={close}
      onResolve={onResolve}
    />
  );
}


