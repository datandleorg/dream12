export default function MainTemplate({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="main-page-enter min-h-0">{children}</div>;
}
