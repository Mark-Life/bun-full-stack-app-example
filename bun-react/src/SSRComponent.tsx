/**
 * Server-side rendered React component example
 */
export function SSRComponent({ message }: { message: string }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SSR Example - Bun + React</title>
        <link rel="stylesheet" href="/index.css" />
      </head>
      <body className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-2xl w-full bg-white rounded-xl p-8 shadow-2xl">
          <h1 className="text-3xl font-bold text-red-500 mb-4">{message}</h1>
          <p className="text-red-500 mb-2">
            This page was rendered on the server using React SSR!
          </p>
          <p className="text-sm text-red-500 mt-4">
            Rendered at: {new Date().toLocaleString()}
          </p>
        </div>
      </body>
    </html>
  );
}
