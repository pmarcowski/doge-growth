# Title: Build Bayesian non-linear mixed effects model for dog growth prediction
# Author: Przemyslaw Marcowski, PhD
# Email: p.marcowski@gmail.com
# Date: 2023-04-02
# Copyright (c) 2023 Przemyslaw Marcowski

# This code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# This script models and predicts dog weight trajectories using a Bayesian
# non-linear mixed effects model. The model assumes a von Bertalanffy growth
# curve, a non-linear function commonly used to model growth in biological
# systems. The model incorporates breed and sex as grouping factors for the
# growth parameters, accounting for variation across different subpopulations.
# After fitting, the model is evaluated by predicting a growth curve for a new
# dog with specified characteristics. The prediction is then interactively
# visualized along with a 95% prediction interval to account for prediction
# uncertainty. The fitted model is saved for use in a Shiny web application,
# which provides a user-friendly interface for inputting dog characteristics
# and generating growth predictions.

# Load packages
library(tidyverse)
library(brms)
library(plotly)

# Data preparation --------------------------------------------------------

# Read prepared dog data
dog_data <- readRDS(file = "./data/dog_data.Rds") 

# Visualize weight trends
dog_data %>%
  ggplot(aes(x = age_weeks, y = weight_lbs, color = breed, fill = breed)) +
  geom_point(alpha = 0.2) +
  geom_smooth(alpha = 0.5) +
  labs(
    x = "Age (weeks)", y = "Weight (lbs)",
    color = "Breed", fill = "Breed"
  ) +
  theme_minimal()

# Model fitting -----------------------------------------------------------

# Specify model formula
model_formula <- brmsformula(
  weight_lbs ~ Linf * (1 - exp(-K * (age_weeks - t0))),
  Linf ~ 1 + (1|breed/sex),
  K ~ 1 + (1|breed/sex),
  t0 ~ 1 + (1|breed/sex),
  nl = TRUE
  )

# Specify model family
model_family <- brmsfamily("gaussian")

# Get priors
model_priors <- get_prior(model_formula, data = dog_data, family = model_family)

# Set model controls
model_controls <- list(adapt_delta = 0.8, max_treedepth = 10)

# Fit model
growth_model <- brm(
  formula = model_formula, data = dog_data, 
  family = model_family, prior = model_priors,
  chains = 4, iter = 4000, warmup = 2000, cores = 4,
  control = model_controls,
  file = "./output/growth_model.Rds"
)

# Inspect model fit
summary(growth_model)

# Inspect model diagnostics
pp_check(growth_model)

# Inspect posterior draws
posterior_summary(growth_model)

## Test ----

# Define model input values for new dog
new_dog_current_age <- 60
new_dog_current_weight <- 85
new_dog_breed <- "Labrador Retriever"
new_dog_sex <- "Male"

# Create data frame for new dog
new_dog <- data.frame(age_weeks = 0:100)
new_dog$breed <- new_dog_breed
new_dog$sex <- new_dog_sex

# Get prediction for new dog
predicted_weights <- predict(growth_model, newdata = new_dog)[, -2]
predicted_current_weight <- predicted_weights[new_dog_current_age]
scaling_factor <- new_dog_current_weight / predicted_current_weight
adjusted_weights <- predicted_weights * scaling_factor
new_dog$predicted_weights <- adjusted_weights[, 1]
new_dog$CI_low <- adjusted_weights[, 2]
new_dog$CI_high <- adjusted_weights[, 3]
new_dog <- new_dog[new_dog$predicted_weights > 0, ]

# Plot predicted growth curve
new_dog_prediction_plot <- 
  ggplot(new_dog, aes(x = age_weeks, y = predicted_weights)) +
  geom_ribbon(aes(ymin = CI_low, ymax = CI_high), fill = "royalblue", alpha = .25) +
  geom_line(color = "royalblue") +
  geom_point(
    x = new_dog_current_age,
    y = new_dog_current_weight,
    shape = 1, size = 5, stroke = .75, color = "red3"
  ) +
  geom_vline(xintercept = new_dog_current_age, linetype = "dashed") +
  geom_hline(yintercept = new_dog_current_weight, linetype = "dashed") +
  labs(x = "Age (weeks)", y = "Weight (lbs)") +
  coord_cartesian(
    xlim = c(0, 100),
    ylim = c(0, round(max(new_dog$predicted_weights) + 20, -1))
  ) +
  theme_minimal()

# Create data frame with tooltip information
tooltip_data <- data.frame(
  x = new_dog$age_weeks,
  y = new_dog$predicted_weights,
  text = paste(
    "<b>Age:</b> ", new_dog$age_weeks, " weeks",
    "<br><b>Predicted weight:</b> ", round(new_dog$predicted_weights, 2), " lbs",
    "<br>",
    "<br><b>95% Prediction interval:</b>",
    "<br>  Lower: ", round(new_dog$CI_low, 2), " lbs",
    "<br>  Upper: ", round(new_dog$CI_high, 2), " lbs",
    "<br>",
    "<br><b>Prediction for:</b>",
    "<br><b>  Breed:</b> ", new_dog_breed,
    "<br><b>  Sex:</b> ", new_dog_sex,
    "<br><b>  Current age:</b> ", round(new_dog_current_age, 1), " weeks",
    "<br><b>  Current weight:</b> ", round(new_dog_current_weight, 2), " lbs",
    "<br><b>  Typical weight at current age:</b> ", round(predicted_current_weight, 2), " lbs",
    sep = ""
  )
)

# Display plot as plotly
ggplotly(new_dog_prediction_plot, tooltip = "text") %>%
  style(
    text = tooltip_data$text,
    hoverinfo = "text",
    traces = 2,
    showlegend = FALSE
  )

# Copy data and model files to Shiny app directory for deployment
file.copy(list("./data/dog_data.Rds", "./output/growth_model.Rds"), "./app/")
