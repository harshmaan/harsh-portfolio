export function trimText(input: string, maxLength: number = 100): string {
  if (input.length <= maxLength) return input;
  return input.substring(0, maxLength - 3) + "...";
}

export function getCurrentTimeInItaly(): Date {
  // Even though the name says Italy, we'll return current time as-is
  // because we'll use the timezone logic in the formatter
  return new Date();
}

export function formatTimeForItaly(date: Date): string {
  const options: Intl.DateTimeFormatOptions = {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata", // This is the key change: now it's IST
  };

  let formattedTime = new Intl.DateTimeFormat("en-US", options).format(date);

  formattedTime += " IST"; // Optional: manually add time zone abbreviation

  return formattedTime;
}

export function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function getCurrentStatus(): string {
  const now = new Date();
  const hourIST = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "Asia/Kolkata" })
  );

  if (hourIST >= 6 && hourIST < 9) {
    return "🏃 Getting those gains! (At the gym)";
  } else if (hourIST >= 9 && hourIST < 12) {
    return "🧠 Deep work mode";
  } else if (hourIST >= 12 && hourIST < 13) {
    return "🍱 Lunch & LinkedIn";
  } else if (hourIST >= 13 && hourIST < 18) {
    return "💻 On meetings, send memes responsibly";
  } else if (hourIST >= 18 && hourIST < 21) {
    return "🧪 Experimenting with GenAI ideas";
  } else if (hourIST >= 21 && hourIST < 24) {
    return "🎮 Gaming or winding down";
  } else {
    return "🌙 Dreaming of better prompts";
  }
}
