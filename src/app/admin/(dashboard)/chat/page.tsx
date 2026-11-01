import { Suspense } from "react";
import { ChatPreview } from "@/components/admin/chat-preview";
import { UnansweredQuestions } from "@/components/admin/unanswered-questions";

export default function ChatPage() {
  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">Chat preview</h1>
        <p className="text-sm text-zinc-500">
          Talks to the public chat endpoint exactly as a visitor would. Your questions count against the rate limits and are logged like a visitor&apos;s.
        </p>
      </div>
      <ChatPreview />
      <Suspense fallback={<p className="text-sm text-zinc-500">Loading questions…</p>}>
        <UnansweredQuestions />
      </Suspense>
    </div>
  );
}
