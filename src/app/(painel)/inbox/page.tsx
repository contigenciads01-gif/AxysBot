import { redirect } from "next/navigation";

/** Menções agora ficam no X Controller (sem API paga, não há sincronização). */
export default function InboxPage() { redirect("/x"); }
