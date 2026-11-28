import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/menu/"],
        disallow: [
          "/admin",
          "/api/",
          "/select-store",
          "/pos",
          "/orders",
          "/receipt/",
          "/staff",
          "/stores",
          "/settings",
          "/shift",
          "/reports",
          "/products",
          "/inventory",
          "/purchases",
          "/customers",
          "/tiers",
          "/vouchers",
          "/tables",
          "/kds",
          "/print-test",
          "/order/",
        ],
      },
    ],
  };
}
