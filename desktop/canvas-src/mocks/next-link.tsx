import React from "react";
export default function Link({ href, children, className, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return <a href={href} className={className} {...props}>{children}</a>;
}
