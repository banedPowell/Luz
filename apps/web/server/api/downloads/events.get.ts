// Hints, not the source of truth: the client loads GET /api/downloads when it opens the stream
// and again on every reconnection, so an event it missed never leaves its screen wrong.
export default defineEventHandler((event) => {
	const stream = createEventStream(event);
	const unsubscribe = useDownloadEvents().subscribe((downloadEvent) => {
		void stream.push({ event: downloadEvent.type, data: JSON.stringify(downloadEvent) });
	});
	// A ping now and then keeps proxies from closing a stream that has nothing to say
	const keepAlive = setInterval(() => void stream.push({ event: 'ping', data: '' }), 25_000);
	stream.onClosed(() => {
		clearInterval(keepAlive);
		unsubscribe();
	});
	return stream.send();
});
