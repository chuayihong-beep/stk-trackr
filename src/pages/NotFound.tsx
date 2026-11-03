import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <div className="py-16 text-center">
      <p className="text-lg font-semibold">Page not found</p>
      <Link to="/" className="mt-2 inline-block text-brand underline">Back to overview</Link>
    </div>
  );
}
