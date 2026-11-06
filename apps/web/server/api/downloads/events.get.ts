// Hints, not the source of truth: the client loads GET /api/downloads when it opens the stream
// and again on every reconnection, so an event it missed never leaves its screen wrong.
export default defineEventHandler((event) => {
	const stream = createEventStream(event);
	const unsubscribe = useDownloadEvents().subscribe((downloadEvent) => {
		void stream.push({ event: downloadEvent.type, data: JSON.stringify(downloadEvent) });
	});
	// The response starts with the first message: without one now, the browser would only
	// see the stream open, and the client load the list, at the first event or ping
	void stream.push({ event: 'ping', data: '' });
	// A ping now and then keeps proxies from closing a stream that has nothing to say
	const keepAlive = setInterval(() => void stream.push({ event: 'ping', data: '' }), 25_000);
	stream.onClosed(() => {
		clearInterval(keepAlive);
		unsubscribe();
	});
	return stream.send();
});
