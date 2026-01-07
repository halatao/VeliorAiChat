import { ChatWidget } from "./components/ChatWidget";
import "./index.css";

export default function App() {
  return (
    <ChatWidget apiUrl="https://localhost:7201" configCode="CZ_ACCOUNTING" />
  );
}
