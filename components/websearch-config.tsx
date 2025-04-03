"use client";

import React from "react";
import useToolsStore from "@/stores/useToolsStore";
import { Input } from "./ui/input";
import CountrySelector from "./country-selector";

export default function WebSearchSettings() {
  const { webSearchConfig, setWebSearchConfig } = useToolsStore();

  const handleClear = () => {
    console.log("Clearing web search config", webSearchConfig);
    setWebSearchConfig({
      user_location: {
        type: "approximate",
        country: "",
        region: "",
        city: "",
      },
    });
  };

  const handleLocationChange = (
    field: "country" | "region" | "city",
    value: string
  ) => {
    setWebSearchConfig({
      ...webSearchConfig,
      user_location: {
        type: "approximate",
        ...webSearchConfig.user_location,
        [field]: value,
      },
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="text-foreground text-sm">User&apos;s location</div>
        <div
          className="text-sm px-1 transition-colors text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={handleClear}
        >
          Clear
        </div>
      </div>
      <div className="mt-3 space-y-3 text-muted-foreground">
        <div className="flex items-center gap-2">
          <label htmlFor="country" className="text-sm w-20 text-foreground">
            Country
          </label>
          <CountrySelector
            value={webSearchConfig.user_location?.country ?? ""}
            onChange={(value) => handleLocationChange("country", value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="region" className="text-sm w-20 text-foreground">
            Region
          </label>
          <Input
            id="region"
            type="text"
            placeholder="Region"
            className="text-sm flex-1"
            value={webSearchConfig.user_location?.region ?? ""}
            onChange={(e) => handleLocationChange("region", e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="city" className="text-sm w-20 text-foreground">
            City
          </label>
          <Input
            id="city"
            type="text"
            placeholder="City"
            className="text-sm flex-1"
            value={webSearchConfig.user_location?.city ?? ""}
            onChange={(e) => handleLocationChange("city", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
