# AI Chat

A very simple AI-driven chat application. The goal was to re-create re [`useChat`](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot) API exposed by `ai` package. It only supports streaming text.

## Running the app

- Create `.env.local` file and populate it with your OpenAI key.

  ```txt
  OPENAI_API_KEY=<your key here>
  ```

- Install dependencies

  ```bash
  pnpm install
  ```

- Run the app

  ```bash
  pnpm run dev
  ```

## Learnings

- In theory, one could use the `for await (const ...)` loop to consume a streamed response when using `fetch` call, but TypeScript complains that the `response.body` is not a `string` type. This is what I come up with.

  ```js
  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      console.log(decoder.decode(value));
    }
  } finally {
    reader.releaseLock();
  }
  ```

- There does not seem to be a good way of using `Map` with `useSyncExternalStore` hook.

  - The `getSnapshot` will always return the same `Map`, unless you re-create it before notifying the subscribers. This is quite awkward.

  - If you try to convert the `Map` into the `Array` via `Array.from(map.values())` in `getSnapshot`, React will fall into infinite loop.

    - This is understandable, as every time the `getSnapshot` is called, the array is a new array, so React will re-render the component and so the loop goes.

  - The `zustand` documentation [states that we should be "updating state"](https://github.com/pmndrs/zustand/blob/66f3a029fbc4640b76c26959e01a5caa857c04dc/docs/guides/maps-and-sets-usage.md) when updating values in a Map.

- The **`flushSync` updates the DOM synchronously BUT IT WILL NOT UPDATE THE STATE synchronously**.

  - This is very important to understand and it took me quite a while to understand.

    ```js
    const decoder = new TextDecoder();
    const reader = chatResponse.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        const chatResponse = decoder.decode(value);

        /**
         * The state will not be updated synchronously!
         */
        const existingMessage = messages.find((m) => m.id === id);
        if (existingMessage) {
          setMessages(
            messages.map((m) => {
              if (m.id === id) {
                return { ...m, content: m.content.concat(chatResponse) };
              }
              return m;
            })
          );
        } else {
          setMessages([...messages, { id, role: "ai", content: chatResponse }]);
        }
      }
    } finally {
      reader.releaseLock();
    }
    ```

- For some reason, TypeScript complains with the following. See [this GitHub thread](https://github.com/microsoft/TypeScript/issues/37663#issuecomment-759728342) for more information.

  ```ts
  function useSyncState<TState>(initialState: TState | (() => TState)) {
    const initialStateRef = useRef<TState | null>(null);
    if (!initialStateRef.current) {
      initialStateRef.current =
        typeof initialState === "function" ? initialState() : initialState; // Error here
    }
  }
  ```

  It seems like one has to create an implicit _type guard_.

  ```ts
  function isFunction<TReturn>(value: unknown): value is () => TReturn {
    return typeof value === "function";
  }

  function useSyncState<TState>(initialState: TState | (() => TState)) {
    const initialStateRef = useRef<TState | null>(null);
    if (!initialStateRef.current) {
      initialStateRef.current = isFunction<TState>(initialState)
        ? initialState()
        : initialState;
    }
  }
  ```

  To me, this feels like a bug.

- The "typewriter" effect while streaming text is possible to achieve with `startViewTransition` API.

  - I wonder about the performance implications of having those run very frequently...

- Even after implementing `useSyncState` via `useSyncExternalState`, I had issues propagating updates from the stream into the state synchronously.

  If you are curious, [here is the `useSyncState` implementation](https://gist.github.com/WojciechMatuszewskiZapier/cd1a51a8909f16b821927eff9d8db8f3).

  ```ts
  const [messages, setMessages] = useSyncState({});

  for await (const { text, id } of aiResponse) {
    const existingMessage = messages[id]; // The `messages` is stale!
    console.log("before setting state", messages);

    if (!existingMessage) {
      setMessages({
        ...messages,
        [id]: {
          id: id,
          role: "ai",
          content: text
        }
      });
    } else {
      setMessages({
        ...messages,
        [id]: {
          ...existingMessage,
          content: existingMessage.content.concat(text)
        }
      });
    }

    console.log("after setting state");
  }
  ```

  I'm unsure why, but only the _callback_ version of `setMessages` worked for me. I suspect this is because calling a function delays the event loop just enough for all the updates to propagate. So, **it seems like using the _callback_ form of the `useState` is the way to go here**.
