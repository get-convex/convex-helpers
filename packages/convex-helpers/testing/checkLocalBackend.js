const http = require("http");
const readline = require("readline");
const { spawnSync } = require("child_process");

// Checks for a local backend running on port 8000.
const parsedUrl = new URL("http://127.0.0.1:8000");
http
  .request(
    {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port,
      path: "/version",
      method: "GET",
    },
    (res) => {
      if (res.statusCode === 200) {
        process.exit(0);
      } else {
        onFailure();
      }
    }
  )
  .on("error", onFailure)
  .end();

function onFailure() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.on("SIGINT", () => {
    rl.close();
    process.exit(1);
  });

  rl.question(
    "Looks like you don't have local backend running, start it now? [Y/n]: ",
    (answer) => {
      rl.close();
      if (
        answer.toLowerCase() === "yes" ||
        answer.toLowerCase() === "y" ||
        answer === ""
      ) {
        console.error(
          "Starting just run-local-backend now via `just run-local-backend`, " +
            "repeat your original command in a new terminal"
        );
        spawnSync("just run-local-backend", { shell: true, stdio: "inherit" });
        console.log("Quiting local backend, all is good!");
        process.exit(1);
      } else {
        console.error(
          "Make sure to run 'just run-local-backend' in another terminal!"
        );
      }
    }
  );
}
