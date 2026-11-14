import { createRoot } from "react-dom/client";
import "./src/styles.css";
import { SpliceApp } from "./src/components/splice-app";

createRoot(document.getElementById("root")!).render(<SpliceApp />);
