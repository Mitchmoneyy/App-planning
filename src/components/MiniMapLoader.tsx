"use client";

// Loads the mini map in the browser only (WebGL can't render on the server).
import dynamic from "next/dynamic";

const MiniMap = dynamic(() => import("./MiniMap"), {
  ssr: false,
  loading: () => <div className="mini-map mini-map--loading" />,
});

export default MiniMap;
