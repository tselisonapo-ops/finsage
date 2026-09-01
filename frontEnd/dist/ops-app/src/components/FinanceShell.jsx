import Shell from "./Shell";

export default function FinanceShell({
  session,
  finance,
  active="finance-overview",
  children
}){
  return (
    <Shell session={session} active={active}>
      <div className="finance-content">
        {children}
      </div>
    </Shell>
  );
}