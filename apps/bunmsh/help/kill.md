## kill

Send a signal to processes.

### Usage

```sh
kill [-SIGNAL] PID ...
```

### Options and forms

- `-SIGNAL`: Select a signal by name or number; the default is SIGTERM.
- `-0`: Check whether a process can be signalled without sending a signal.

### Example

```sh
kill -0 $$
echo $?
```

Output:

```text
0
```
