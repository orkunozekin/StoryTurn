export default function LibraryLayout({ children, modal }: LayoutProps<"/library">) {
  return (
    <>
      {children}
      {modal}
    </>
  );
}
