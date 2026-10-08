import { Console } from "@/components/Console";
import { db } from "@/lib/db";

export default function Home() {
  return <Console customers={db.customers.map(({ id, name }) => ({ id, name }))} />;
}
