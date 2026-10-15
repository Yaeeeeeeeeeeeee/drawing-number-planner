import type { ReactNode } from 'react';

/** Shared module heading; business notices remain in their original page sections. */
export function PageHeader({ title, description, children }: { title: ReactNode; description: ReactNode; children?: ReactNode }) {
  return <header className="page-header standard-page-header"><div className="page-heading-copy">
    <h1>{title}</h1><p className="page-description">{description}</p>
  </div>{children}</header>;
}
