import type { MetadataRoute } from "next";
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.mkdir.space",
      lastModified: "2026-09-23",
      changeFrequency: "monthly",
    },
    {
      url: "https://www.mkdir.space/hr-management-romania",
      lastModified: "2026-09-23",
      changeFrequency: "monthly",
    },
  ];
}
