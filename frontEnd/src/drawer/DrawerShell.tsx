import { useEffect } from "react";
import type { ReactNode } from "react";
import "./drawerShell.css";

type Props = {
  open: boolean;
  title: string;
  onClose: () => void;
  width?: number;                 // px
  position?: "right" | "center" | "left"; // 👈 add
  children: ReactNode;
};

export default function DrawerShell({
  open,
  title,
  onClose,
  width = 920,                    // 👈 bigger default
  position = "center",            // 👈 center by default
  children,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

    return (
    <div
        className="fs-drawer-root"
        role="dialog"
        aria-modal="true"
        onClick={onClose} // ✅ click outside closes
    >
        {/* overlay + positioning wrapper */}
        <div className={`fs-drawer-overlay ${position}`}>
        {/* panel */}
        <div
            className="fs-drawer-panel"
            style={{ width }}
            onClick={(e) => e.stopPropagation()} // ✅ clicks inside DON'T close
        >
            <div className="fs-drawer-head">
            <div className="fs-drawer-title">{title}</div>
            <button
                className="fs-drawer-close"
                onClick={onClose}
                aria-label="Close"
                type="button"
            >
                ×
            </button>
            </div>

            <div className="fs-drawer-body">{children}</div>
        </div>
        </div>
    </div>
    );
}
