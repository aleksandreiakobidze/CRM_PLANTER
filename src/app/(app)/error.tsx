"use client";

export default function AppError({ error }: { error: Error }) {
  return (
    <div className="card">
      <h1>ოპერაცია ვერ შესრულდა</h1>
      <p className="err">{error.message}</p>
    </div>
  );
}
