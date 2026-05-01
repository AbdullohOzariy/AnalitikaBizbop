export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-150 fill-mode-both">
      {children}
    </div>
  );
}
