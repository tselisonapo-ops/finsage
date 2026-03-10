import ReactDOM from "react-dom/client";
import DrawerController from "./drawerController";

export function mountDrawerController() {
  const el = document.getElementById("fs-react-drawer-root");
  if (!el) throw new Error("Missing #fs-react-drawer-root");

  const root = ReactDOM.createRoot(el);
  root.render(<DrawerController />);
  return root;
}

