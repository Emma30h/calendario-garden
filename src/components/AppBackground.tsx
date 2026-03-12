"use client";

import { useEffect, useState } from "react";

const BACKGROUND_IMAGE_SRC = "/escudo_png_2.png";

export function AppBackground() {
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const image = new Image();
    const markAsReady = () => setIsReady(true);

    image.src = BACKGROUND_IMAGE_SRC;

    if (image.complete) {
      markAsReady();
      return;
    }

    image.addEventListener("load", markAsReady);
    image.addEventListener("error", markAsReady);

    return () => {
      image.removeEventListener("load", markAsReady);
      image.removeEventListener("error", markAsReady);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className={`app-background ${isReady ? "is-ready" : "is-loading"}`}
    >
      <div className="app-background-gradient" />
      <div className="app-moving-blobs">
        <span className="app-blob app-blob--1" />
        <span className="app-blob app-blob--2" />
        <span className="app-blob app-blob--3" />
        <span className="app-blob app-blob--4" />
      </div>
      <div className="app-background-image" />
      <div className="app-background-skeleton" />
    </div>
  );
}
