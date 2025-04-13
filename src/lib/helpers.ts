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

  if (hourIST >= 8 && hourIST < 9) {
    return "🚿 Rushing to get ready and head to work";
  } else if (hourIST >= 9 && hourIST < 13) {
    return "🧠 In Meetings";
  } else if (hourIST >= 13 && hourIST < 14) {
    return "🍱 Grabbing something to eat";
  } else if (hourIST >= 14 && hourIST < 18) {
    return "💻 Still in meetings";
  } else if (hourIST >= 18 && hourIST < 21) {
    return "🧪 Out and about — reply might be slow";
  } else if (hourIST >= 21 && hourIST < 24) {
    return "🎮 Free to chat!";
  } else {
    return "🌙 Currently dreaming...";
  }
}
