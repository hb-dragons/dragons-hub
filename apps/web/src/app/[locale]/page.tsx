import { Button } from "@dragons/ui/components/button";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          web -&gt; @dragons/ui
        </h1>
        <div className="flex gap-2">
          <Button>Default</Button>
          <Button variant="outline">Outline</Button>
        </div>
      </div>
    </main>
  );
}
