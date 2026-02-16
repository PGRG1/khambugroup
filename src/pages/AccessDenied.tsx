import { Navigate } from "react-router-dom";

export default function AccessDenied() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center text-center space-y-4">
      <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
        <svg className="h-8 w-8 text-destructive" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold font-display text-foreground">Access Denied</h1>
      <p className="text-muted-foreground text-sm max-w-md">
        You don't have permission to access this page. Contact your administrator to request access.
      </p>
    </div>
  );
}
