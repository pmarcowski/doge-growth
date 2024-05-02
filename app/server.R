# Title: Server logic for interactive dog growth prediction Shiny app
# Author: Przemyslaw Marcowski, PhD
# Email: p.marcowski@gmail.com
# Date: 2023-06-15
# Copyright (c) 2023 Przemyslaw Marcowski

# This code is licensed under the MIT license found in the
# LICENSE file in the root directory of this source tree.

# This is the UI logic of a Shiny web application for predicting dog growth

server <- function(input, output, session) {
  
  # Initialize data for new dog details
  D <- reactiveValues()
  
  # Update dog details based on user input
  observe({
    D$breed <- input$breed
    D$sex <- input$sex
    D$current_weight_lbs <- input$current_weight_slider
  })
  
  # Update the age input UI based on the selected input type
  observe({
    if (input$switch_age_input == "Birth date") {
      disable("current_age_slider")
      enable("birthdate")
    } else if (input$switch_age_input == "Slider") {
      disable("birthdate")
      enable("current_age_slider")
    }
  })
  
  # Calculate current age in weeks based on the selected input type
  current_age_weeks <- reactive({
    if (input$switch_age_input == "Birth date") {
      req(input$birthdate)
      as.numeric(difftime(Sys.Date(), input$birthdate, units = "weeks"))
    } else if (input$switch_age_input == "Slider") {
      req(input$current_age_slider)
      input$current_age_slider
    }
  })
  
  # Enable or disable the predict button based on input validity
  observe({
    valid_breed <- !is.null(input$breed) && input$breed != "Select breed"
    valid_sex <- !is.null(input$sex) && input$sex != "Select sex"
    valid_weight <- !is.null(input$current_weight_slider) && is.numeric(input$current_weight_slider)
    
    if (input$switch_age_input == "Birth date") {
      valid_age <- !is.null(input$birthdate)
    } else if (input$switch_age_input == "Slider") {
      valid_age <- !is.null(input$current_age_slider)
    } else {
      valid_age <- FALSE
    }
    
    if (any(!valid_breed, !valid_sex, !valid_weight, !valid_age)) {
      disable("predict_weight")
    } else {
      enable("predict_weight")
    }
  })

  # Calculate growth curve when the predict button is clicked
  observeEvent(input$predict_weight, {
    # Get model input values for new dog
    breed <- D$breed
    sex <- D$sex
    current_age <- current_age_weeks()
    current_weight <- D$current_weight_lbs
    
    # Calculate max age by rounding up to nearest hundred
    max_age <- ceiling(current_age / 100) * 100

    # Create data frame for new dog
    new_dog <- data.frame(age_weeks = 0:max_age)
    new_dog$breed <- breed
    new_dog$sex <- sex
    
    # Get prediction for new dog
    predicted_weights <- predict(growth_model, newdata = new_dog, allow_new_levels = TRUE)[, -2]
    
    # Apply weight scaling for new dog
    predicted_current_weight <- predicted_weights[current_age]
    scaling_factor <- current_weight / predicted_current_weight
    adjusted_weights <- predicted_weights * scaling_factor
    new_dog$predicted_weights <- adjusted_weights[, 1]
    new_dog$CI_low <- adjusted_weights[, 2]
    new_dog$CI_high <- adjusted_weights[, 3]
    
    # Filter data to include only predicted weights greater than 0
    new_dog <- new_dog[new_dog$predicted_weights > 0 & new_dog$CI_low > 0 & new_dog$CI_high > 0, ]
    
    # Check for a negative trend
    slope <- coef(lm(predicted_weights ~ age_weeks, data = new_dog))[2]
    if (slope < 0) {
      showNotification(
        "Warning: Negative trend detected in predicted weights.", 
        duration = NULL, id = "trend_warning", type = "warning"
        )
    } else {
      removeNotification(id = "trend_warning")
    }
    
    # Check for significant discrepancies between current and typical weight
    if (scaling_factor > 1.5 || scaling_factor < .5) {
      showNotification(
        "Warning: Significant discrepancy detected between current and typical weight.", 
        duration = NULL, id = "discrepancy_warning", type = "warning"
        )
    } else {
      removeNotification(id = "discrepancy_warning")
    }
    
    # Check for unrealistic growth rates
    growth_rates <- diff(new_dog$predicted_weights) / diff(new_dog$age_weeks)
    if (any(growth_rates < -1) || any(growth_rates > 10)) {
      showNotification(
        "Warning: Unrealistic growth rates detected.", 
        duration = NULL, id = "rate_warning", type = "warning"
        )
    } else {
      removeNotification(id = "rate_warning")
    }
    
    # Create prediction plot
    p <-
      ggplot(new_dog, aes(x = age_weeks, y = predicted_weights)) +
      geom_ribbon(aes(ymin = CI_low, ymax = CI_high), fill = "#2980b9", alpha = .25) +
      geom_line(color = "#2980b9") +
      geom_point(
        x = current_age,
        y = current_weight,
        shape = 0, size = 8, stroke = .75, color = "#e74c3c"
      ) +
      geom_vline(xintercept = current_age, linetype = "dashed") +
      geom_hline(yintercept = current_weight, linetype = "dashed") +
      labs(x = "Age (weeks)", y = "Weight (lbs)") +
      coord_cartesian(
        xlim = c(0, max(new_dog$age_weeks)),
        ylim = c(0, round(max(new_dog$predicted_weights) + 20, -1))
      ) +
      theme_minimal()
    
    # Render prediction plot as plotly
    output$predict_plot <- renderPlotly({
      ggplotly(p, tooltip = "none") %>%
        layout(
          hovermode = "x",
          dragmode = FALSE
          ) %>%
        style(
          hovertemplate = paste(
            "<b>Age:</b> %{x:.0f} weeks",
            "<br><b>Predicted weight:</b> %{y:.2f} lbs",
            "<br>",
            "<br><b>95% Prediction interval:</b>",
            "<br> Lower: %{customdata[0]:.2f} lbs",
            "<br> Upper: %{customdata[1]:.2f} lbs",
            "<br>",
            "<br><b>Prediction for:</b>",
            "<br><b> Breed:</b>", breed, paste0("(", sex, ")"),
            "<br><b> Current age:</b>", round(current_age, 1), " weeks",
            "<br><b> Current weight:</b>", round(current_weight, 2), " lbs",
            "<br><b> Typical weight at current age:</b>", round(predicted_current_weight, 2), " lbs",
            "<extra></extra>"
          ),
          customdata = cbind(new_dog$CI_low, new_dog$CI_high),
          traces = 2,
          showlegend = FALSE
        ) %>%
        config(responsive = TRUE)
    })
  })
}
