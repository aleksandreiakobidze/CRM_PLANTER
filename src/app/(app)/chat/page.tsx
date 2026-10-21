import { MessengerPage } from "@/components/messenger";
import { CHAT_COPY } from "@/server/features/chat/chat-copy";

export default function ChatPage() {
  return (
    <section className="grid">
      <div className="page-head">
        <h1>{CHAT_COPY.chat}</h1>
      </div>
      <MessengerPage />
    </section>
  );
}
