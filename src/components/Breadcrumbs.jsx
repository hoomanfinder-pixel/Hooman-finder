import { Link } from "react-router-dom";

export function StructuredData({ value }) {
  if (!value) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(value).replace(/</g, "\\u003c") }}
    />
  );
}

export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="text-xs font-semibold text-[#6F6A66]">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li key={item.to} className="flex items-center gap-2">
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {index === items.length - 1 ? (
              <span aria-current="page" className="text-[#183D35]">{item.label}</span>
            ) : (
              <Link to={item.to} className="hover:text-[#183D35] hover:underline">
                {item.label}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
