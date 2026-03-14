import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import FixedAssetsDrawer from "./FixedAssetsDrawer";
import type {
  FixedAssetsDrawerOpenArgs,
  FixedAssetsDrawerResult,
} from "./FixedAssetsDrawer";

type OpenEventDetail = {
  args: FixedAssetsDrawerOpenArgs;
  resolve: (res: FixedAssetsDrawerResult) => void;
};

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
    const onOpen = (event: Event) => {
      const customEvent = event as CustomEvent<OpenEventDetail>;
      const detail = customEvent.detail;
      if (!detail) return;

      setArgs(detail.args);
      setOpen(true);

      resolverRef.current = (res) => {
        detail.resolve(res);
        close();
      };
    };

    const onClose = () => {
      close();
    };

    window.addEventListener("fs:open-fixed-assets-drawer", onOpen);
    window.addEventListener("fs:close-fixed-assets-drawer", onClose);

    return () => {
      window.removeEventListener("fs:open-fixed-assets-drawer", onOpen);
      window.removeEventListener("fs:close-fixed-assets-drawer", onClose);
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