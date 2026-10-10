import { logOutAction } from './log-out';

export function LogOutButton() {
  return (
    <form action={logOutAction}>
      <button
        type="submit"
        className="w-full rounded-md border border-neutral-300 px-4 py-2 font-medium hover:bg-neutral-100"
      >
        Log out
      </button>
    </form>
  );
}
